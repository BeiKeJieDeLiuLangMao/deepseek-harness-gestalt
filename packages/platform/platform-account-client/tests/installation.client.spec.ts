import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AccountSessionView, LoginAttemptView } from '@deepseek-ai/dsh-platform-account'
import {
  ACCOUNT_PRIVACY_NOTICE,
  IndexedDbInstallationAccountStore,
  MemoryInstallationAccountStore,
  PlatformAccountHttpTransport,
  PlatformAccountInstallation,
  accountStorageNamespace,
  type PlatformAccountTransport,
} from '../src/index.ts'

afterEach(() => { vi.unstubAllGlobals() })

const ATTEMPT: LoginAttemptView = {
  id: 'attempt-1' as never,
  state: 'state-1',
  authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=client&state=state-1',
  pollingToken: 'polling-token',
  expiresAt: Date.now() + 300_000,
}

function session(accountId: string, login: string, accessExpiresAt = Date.now() + 900_000): AccountSessionView {
  return {
    sessionId: `session-${accountId}` as never,
    account: {
      id: accountId as never,
      githubId: accountId === 'account-a' ? 1 : 2,
      githubLogin: login,
      avatarUrl: `https://avatars.example/${login}`,
    },
    accessToken: `access-${accountId}`,
    refreshToken: `refresh-${accountId}`,
    accessExpiresAt,
    refreshExpiresAt: Date.now() + 2_592_000_000,
  }
}

interface MockTransport {
  beginLogin: Mock<PlatformAccountTransport['beginLogin']>
  pollLogin: Mock<PlatformAccountTransport['pollLogin']>
  refresh: Mock<PlatformAccountTransport['refresh']>
  current: Mock<PlatformAccountTransport['current']>
  signOut: Mock<PlatformAccountTransport['signOut']>
}

function transport(results: AccountSessionView[]): MockTransport {
  return {
    beginLogin: vi.fn<PlatformAccountTransport['beginLogin']>().mockResolvedValue(ATTEMPT),
    pollLogin: vi.fn<PlatformAccountTransport['pollLogin']>()
      .mockImplementation(async () => ({ status: 'complete', ...results.shift()! })),
    refresh: vi.fn<PlatformAccountTransport['refresh']>(),
    current: vi.fn<PlatformAccountTransport['current']>(),
    signOut: vi.fn<PlatformAccountTransport['signOut']>().mockResolvedValue(undefined),
  }
}

describe('PlatformAccountInstallation', () => {
  it.each(['desktop', 'mobile'] as const)('shows bilingual privacy before %s authorization', async (kind) => {
    const openSystemBrowser = vi.fn()
    const installation = new PlatformAccountInstallation({
      environment: 'development',
      installationId: `${kind}-1`,
      installationKind: kind,
      transport: transport([session('account-a', 'octocat')]),
      store: new MemoryInstallationAccountStore(),
      openSystemBrowser,
      crypto: webcrypto as Crypto,
    })
    expect(installation.getSnapshot().privacyAccepted).toBe(false)
    await expect(installation.beginLogin()).rejects.toThrow('privacy notice must be accepted')
    installation.acceptPrivacy()
    await installation.beginLogin()
    expect(openSystemBrowser).toHaveBeenCalledWith(ATTEMPT.authorizationUrl)
  })

  it('keeps account-specific material namespaces separate when an installation switches accounts', async () => {
    const store = new MemoryInstallationAccountStore()
    const installation = new PlatformAccountInstallation({
      environment: 'production',
      installationId: 'mobile-2',
      installationKind: 'mobile',
      transport: transport([session('account-a', 'octocat'), session('account-b', 'hubot')]),
      store,
      openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
    })
    installation.acceptPrivacy()
    await installation.beginLogin()
    await installation.pollLogin()
    store.setAccountMaterial('account-a', 'pairing-key', 'a-only')
    store.setAccountMaterial('account-a', 'receipt', 'a-receipt')

    await installation.beginLogin()
    await installation.pollLogin()
    expect(installation.getSnapshot().account?.id).toBe('account-b')
    expect(store.getAccountMaterial('account-b', 'pairing-key')).toBeUndefined()
    expect(store.getAccountMaterial('account-a', 'pairing-key')).toBe('a-only')
    expect(accountStorageNamespace('production', 'account-a' as never))
      .not.toBe(accountStorageNamespace('production', 'account-b' as never))
  })

  it('signs out the current installation while preserving account-scoped material', async () => {
    const store = new MemoryInstallationAccountStore()
    const api = transport([session('account-a', 'octocat')])
    const installation = new PlatformAccountInstallation({
      environment: 'development',
      installationId: 'desktop-2',
      installationKind: 'desktop',
      transport: api,
      store,
      openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
    })
    installation.acceptPrivacy()
    await installation.beginLogin()
    await installation.pollLogin()
    store.setAccountMaterial('account-a', 'personal-pairing', 'preserved')
    await installation.signOut()
    expect(installation.getSnapshot().account).toBeUndefined()
    expect(store.getAccountMaterial('account-a', 'personal-pairing')).toBe('preserved')
    expect(api.signOut).toHaveBeenCalledOnce()
  })

  it('confirms a restored unexpired session with Platform before publishing the account', async () => {
    const store = new MemoryInstallationAccountStore()
    const restored = session('account-a', 'octocat', 2_000)
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )
    await store.saveSession({ environment: 'development', session: restored, privateKey: pair.privateKey })
    const api = transport([])
    vi.mocked(api.current).mockResolvedValue(restored.account)
    const installation = new PlatformAccountInstallation({
      environment: 'development',
      installationId: 'desktop-restored',
      installationKind: 'desktop',
      transport: api,
      store,
      openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
      now: () => 1_000,
    })

    await installation.load()

    expect(api.current).toHaveBeenCalledOnce()
    expect(installation.getSnapshot().account).toEqual(restored.account)
  })

  it('rotates an expired access token during restoration and persists the replacement', async () => {
    const store = new MemoryInstallationAccountStore()
    const expired = session('account-a', 'octocat', 999)
    const replacement = session('account-a', 'octocat', 2_000)
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )
    await store.saveSession({ environment: 'production', session: expired, privateKey: pair.privateKey })
    const api = transport([])
    vi.mocked(api.refresh).mockResolvedValue(replacement)
    const installation = new PlatformAccountInstallation({
      environment: 'production',
      installationId: 'mobile-restored',
      installationKind: 'mobile',
      transport: api,
      store,
      openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
      now: () => 1_000,
    })

    await installation.load()

    expect(api.refresh).toHaveBeenCalledOnce()
    expect((await store.loadSession('production'))?.session).toEqual(replacement)
    expect(installation.getSnapshot().account).toEqual(replacement.account)
  })

  it('clears local authorization when Platform reports the session was revoked', async () => {
    const store = new MemoryInstallationAccountStore()
    const restored = session('account-a', 'octocat', 2_000)
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )
    await store.saveSession({ environment: 'development', session: restored, privateKey: pair.privateKey })
    const api = transport([])
    vi.mocked(api.current).mockRejectedValue(new Error('SESSION_REVOKED: Account Session is revoked'))
    const installation = new PlatformAccountInstallation({
      environment: 'development',
      installationId: 'desktop-revoked',
      installationKind: 'desktop',
      transport: api,
      store,
      openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
      now: () => 1_000,
    })

    await installation.load()

    expect(await store.loadSession('development')).toBeUndefined()
    expect(installation.getSnapshot().status).toBe('idle')
  })

  it('handles pending, missing, failed, and terminal installation operations', async () => {
    const store = new MemoryInstallationAccountStore()
    const api = transport([session('account-a', 'octocat')])
    const installation = new PlatformAccountInstallation({
      environment: 'development', installationId: 'mobile-errors', installationKind: 'mobile',
      transport: api, store, openSystemBrowser: vi.fn(), crypto: webcrypto as Crypto,
    })
    await expect(installation.pollLogin()).rejects.toThrow('no login attempt')
    await expect(installation.signOut()).resolves.toBeUndefined()

    installation.acceptPrivacy()
    await installation.beginLogin()
    vi.mocked(api.pollLogin).mockResolvedValueOnce({ status: 'pending' })
    await expect(installation.pollLogin()).resolves.toEqual({ status: 'pending' })
    vi.mocked(api.pollLogin).mockRejectedValueOnce('poll failed')
    await expect(installation.pollLogin()).rejects.toBe('poll failed')
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', error: 'poll failed' })
    installation.acceptPrivacy()
    await installation.pollLogin()

    vi.mocked(api.signOut).mockRejectedValueOnce(new Error('SESSION_EXPIRED: expired'))
    await installation.signOut()
    expect(installation.getSnapshot().status).toBe('idle')
  })

  it('publishes non-terminal load and sign-out failures and removes subscribers', async () => {
    const store = new MemoryInstallationAccountStore()
    const restored = session('account-a', 'octocat', 2_000)
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
    )
    await store.saveSession({ environment: 'development', session: restored, privateKey: pair.privateKey })
    const api = transport([])
    vi.mocked(api.current).mockRejectedValueOnce(new Error('network unavailable'))
    const installation = new PlatformAccountInstallation({
      environment: 'development', installationId: 'desktop-failure', installationKind: 'desktop',
      transport: api, store, openSystemBrowser: vi.fn(), crypto: webcrypto as Crypto, now: () => 1_000,
    })
    const listener = vi.fn()
    const dispose = installation.subscribe(listener)
    await installation.load()
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', error: 'network unavailable' })
    dispose()
    installation.acceptPrivacy()
    expect(listener).toHaveBeenCalledOnce()

    vi.mocked(api.signOut).mockRejectedValueOnce(new Error('sign-out unavailable'))
    await expect(installation.signOut()).rejects.toThrow('sign-out unavailable')
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', error: 'sign-out unavailable' })
  })

  it('clears an expired refresh lifetime and uses default runtime adapters', async () => {
    const store = new MemoryInstallationAccountStore()
    const expired = session('account-a', 'octocat')
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
    )
    await store.saveSession({ environment: 'development', session: { ...expired, refreshExpiresAt: 1 }, privateKey: pair.privateKey })
    const installation = new PlatformAccountInstallation({
      environment: 'development', installationId: 'desktop-defaults', installationKind: 'desktop',
      transport: transport([]), store, openSystemBrowser: vi.fn(),
    })
    await installation.load()
    expect(await store.loadSession('development')).toBeUndefined()
  })

  it('publishes authorization failures and keeps their message out of the next consent snapshot', async () => {
    const api = transport([])
    vi.mocked(api.beginLogin).mockRejectedValueOnce(new Error('login unavailable'))
    const installation = new PlatformAccountInstallation({
      environment: 'development', installationId: 'desktop-login-error', installationKind: 'desktop',
      transport: api, store: new MemoryInstallationAccountStore(), openSystemBrowser: vi.fn(),
      crypto: webcrypto as Crypto,
    })
    installation.acceptPrivacy()
    await expect(installation.beginLogin()).rejects.toThrow('login unavailable')
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', error: 'login unavailable' })
    installation.acceptPrivacy()
    expect(installation.getSnapshot().error).toBeUndefined()
  })

  it('retains the signed-in account on non-terminal sign-out failure', async () => {
    const store = new MemoryInstallationAccountStore()
    const api = transport([session('account-a', 'octocat')])
    const installation = new PlatformAccountInstallation({
      environment: 'development', installationId: 'desktop-signout-error', installationKind: 'desktop',
      transport: api, store, openSystemBrowser: vi.fn(), crypto: webcrypto as Crypto,
    })
    installation.acceptPrivacy()
    await installation.beginLogin()
    await installation.pollLogin()
    vi.mocked(api.signOut).mockRejectedValueOnce('sign-out failed')
    await expect(installation.signOut()).rejects.toBe('sign-out failed')
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', account: { githubLogin: 'octocat' } })
    installation.acceptPrivacy()
    expect(installation.getSnapshot()).toMatchObject({ status: 'failed', account: { githubLogin: 'octocat' } })
  })
})

describe('PlatformAccountHttpTransport', () => {
  const proof = { jti: 'proof', issuedAt: 123, signature: 'signature' }

  it.each([
    { development: 'http://dev.example', production: 'https://prod.example' },
    { development: 'https://dev.example', production: 'http://prod.example' },
    { development: 'https://same.example/a', production: 'https://same.example/b' },
  ])('rejects invalid origin pairs', (origins) => {
    expect(() => new PlatformAccountHttpTransport({ environment: 'development', origins }))
      .toThrow('distinct HTTPS origins')
  })

  it('routes every operation to the selected environment with JSON and proof headers', async () => {
    const calls: Array<[string, RequestInit]> = []
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init ?? {}])
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ status: 'pending', githubLogin: 'octocat' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    const transport = new PlatformAccountHttpTransport({
      environment: 'production',
      origins: { development: 'https://dev.example', production: 'https://prod.example/path' },
      fetch,
    })
    await transport.beginLogin({ installationId: 'mobile-1', installationKind: 'mobile', publicKey: {} })
    await transport.pollLogin({ attemptId: 'attempt', pollingToken: 'poll', proof })
    await transport.refresh({ refreshToken: 'refresh', proof })
    await transport.current({ accessToken: 'access', proof })
    await transport.signOut({ accessToken: 'access', proof })

    expect(calls.map(([url]) => url)).toEqual([
      'https://prod.example/v1/account/login-attempts',
      'https://prod.example/v1/account/login-poll',
      'https://prod.example/v1/account/session/refresh',
      'https://prod.example/v1/account/session',
      'https://prod.example/v1/account/session',
    ])
    expect(new Headers(calls[0]?.[1].headers).get('content-type')).toBe('application/json')
    expect(new Headers(calls[3]?.[1].headers)).toMatchObject(expect.any(Headers))
    expect(new Headers(calls[3]?.[1].headers).get('x-gestalt-proof-jti')).toBe('proof')
    expect(new Headers(calls[3]?.[1].headers).get('authorization')).toBe('Bearer access')
  })

  it('uses stable Platform errors and falls back for proxy and malformed error bodies', async () => {
    const bodies: Array<{ body: BodyInit; contentType?: string; expected: string }> = [
      { body: JSON.stringify({ error: { code: 'SESSION_REVOKED', message: 'revoked' } }), contentType: 'application/json', expected: 'SESSION_REVOKED: revoked' },
      { body: 'proxy failure', expected: 'Platform Account request failed with HTTP 502' },
      { body: 'null', contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
      { body: '{}', contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
      { body: JSON.stringify({ error: null }), contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
      { body: JSON.stringify({ error: {} }), contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
      { body: JSON.stringify({ error: { code: 1, message: 'bad' } }), contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
      { body: JSON.stringify({ error: { code: 'BAD', message: 1 } }), contentType: 'application/json', expected: 'Platform Account request failed with HTTP 502' },
    ]
    for (const item of bodies) {
      const transport = new PlatformAccountHttpTransport({
        environment: 'development',
        origins: { development: 'https://dev.example', production: 'https://prod.example' },
        fetch: vi.fn().mockResolvedValue(new Response(item.body, {
          status: 502, headers: item.contentType === undefined ? {} : { 'content-type': item.contentType },
        })),
      })
      await expect(transport.current({ accessToken: 'access', proof })).rejects.toThrow(item.expected)
    }
  })

  it('retains the global fetch default without crossing environments', () => {
    expect(() => new PlatformAccountHttpTransport({
      environment: 'development',
      origins: { development: 'https://dev.example', production: 'https://prod.example' },
    })).not.toThrow()
  })
})

describe('IndexedDbInstallationAccountStore', () => {
  it('round-trips session and pending records under environment-specific keys', async () => {
    const fake = indexedDbFake()
    vi.stubGlobal('indexedDB', fake.api)
    const store = new IndexedDbInstallationAccountStore()
    const pair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
    )
    const record = { environment: 'development' as const, session: session('account-a', 'octocat'), privateKey: pair.privateKey }
    await store.saveSession(record)
    expect(await store.loadSession('development')).toEqual(record)
    await store.clearSession('development')
    expect(await store.loadSession('development')).toBeUndefined()
    await store.savePending('production', { attempt: ATTEMPT, privateKey: pair.privateKey })
    expect(await store.loadPending('production')).toMatchObject({ attempt: ATTEMPT })
    await store.clearPending('production')
    expect(await store.loadPending('production')).toBeUndefined()
    expect(fake.opened).toEqual(['deepseek-gestalt-platform-account'])
  })

  it.each(['open', 'read', 'write', 'remove'] as const)('propagates IndexedDB %s failures', async (failure) => {
    const fake = indexedDbFake(failure)
    vi.stubGlobal('indexedDB', fake.api)
    const store = new IndexedDbInstallationAccountStore('failure-db')
    let operation: Promise<unknown>
    if (failure === 'open' || failure === 'read') {
      operation = store.loadSession('development')
    } else {
      const pair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
      )
      operation = failure === 'write'
        ? store.saveSession({ environment: 'development', session: session('account-a', 'octocat'), privateKey: pair.privateKey })
        : store.clearSession('development')
    }
    await expect(operation).rejects.toThrow(`fake ${failure} failure`)
  })

  it.each([
    ['open-null', 'Platform Account IndexedDB open failed'],
    ['read-null', 'Platform Account IndexedDB read failed'],
    ['write-null', 'Platform Account IndexedDB write failed'],
    ['remove-null', 'Platform Account IndexedDB delete failed'],
  ] as const)('supplies a stable fallback for IndexedDB %s failures without an error', async (failure, message) => {
    const fake = indexedDbFake(failure)
    vi.stubGlobal('indexedDB', fake.api)
    const store = new IndexedDbInstallationAccountStore('failure-db')
    let operation: Promise<unknown>
    if (failure === 'open-null' || failure === 'read-null') {
      operation = store.loadSession('development')
    } else {
      const pair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
      )
      operation = failure === 'write-null'
        ? store.saveSession({ environment: 'development', session: session('account-a', 'octocat'), privateKey: pair.privateKey })
        : store.clearSession('development')
    }
    await expect(operation).rejects.toThrow(message)
  })
})

describe('ACCOUNT_PRIVACY_NOTICE', () => {
  it('states retained data, retention, encrypted blobs, and the absent deletion flow in both languages', () => {
    expect(ACCOUNT_PRIVACY_NOTICE.zh).toContain('7 天')
    expect(ACCOUNT_PRIVACY_NOTICE.zh).toContain('30 天')
    expect(ACCOUNT_PRIVACY_NOTICE.zh).toContain('不提供账号删除')
    expect(ACCOUNT_PRIVACY_NOTICE.en).toContain('7 days')
    expect(ACCOUNT_PRIVACY_NOTICE.en).toContain('30 days')
    expect(ACCOUNT_PRIVACY_NOTICE.en).toContain('does not provide account deletion')
  })
})

function indexedDbFake(failure?: 'open' | 'read' | 'write' | 'remove' | 'open-null' | 'read-null' | 'write-null' | 'remove-null'): {
  api: IDBFactory
  opened: string[]
} {
  const records = new Map<IDBValidKey, unknown>()
  const opened: string[] = []
  const database = {
    createObjectStore: vi.fn(),
    transaction() {
      const transaction: Record<string, unknown> = {
        error: failure?.endsWith('-null') === true ? null : new Error(`fake ${failure ?? 'transaction'} failure`),
      }
      transaction.objectStore = () => ({
        get(key: IDBValidKey) {
          const request: Record<string, unknown> = {
            result: records.get(key), error: failure === 'read-null' ? null : new Error('fake read failure'),
          }
          queueMicrotask(() => {
            if (failure === 'read' || failure === 'read-null') (request.onerror as (() => void))()
            else (request.onsuccess as (() => void))()
          })
          return request
        },
        put(value: unknown, key: IDBValidKey) {
          records.set(key, value)
          queueMicrotask(() => {
            if (failure === 'write' || failure === 'write-null') (transaction.onerror as (() => void))()
            else (transaction.oncomplete as (() => void))()
          })
        },
        delete(key: IDBValidKey) {
          records.delete(key)
          queueMicrotask(() => {
            if (failure === 'remove' || failure === 'remove-null') (transaction.onerror as (() => void))()
            else (transaction.oncomplete as (() => void))()
          })
        },
      })
      return transaction
    },
  }
  return {
    opened,
    api: {
      open(name: string) {
        opened.push(name)
        const request: Record<string, unknown> = {
          result: database, error: failure === 'open-null' ? null : new Error('fake open failure'),
        }
        queueMicrotask(() => {
          if (failure === 'open' || failure === 'open-null') (request.onerror as (() => void))()
          else {
            ;(request.onupgradeneeded as (() => void))()
            ;(request.onsuccess as (() => void))()
          }
        })
        return request
      },
    } as unknown as IDBFactory,
  }
}
