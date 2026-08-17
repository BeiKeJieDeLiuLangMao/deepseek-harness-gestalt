import { createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type {
  AccountProof,
  AccountSessionId,
  LoginAttemptId,
  PlatformAccountId,
} from '@deepseek-ai/dsh-platform-account'
import {
  ACCESS_TOKEN_TTL_MS,
  ACCOUNT_PROOF_WINDOW_MS,
  LOGIN_ATTEMPT_TTL_MS,
  MAX_REFRESH_TOKEN_TTL_MS,
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  accountProofPayload,
  hashAccountToken,
  type AccountBackend,
  type GitHubIdentity,
  type GitHubIdentityProvider,
  type PlatformAccountConfig,
} from '../src/index.ts'

const NOW = Date.parse('2026-08-17T10:00:00.000Z')

function installationKey() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    publicKey: pair.publicKey.export({ format: 'jwk' }),
    proof(operation: string, binding: string, issuedAt = NOW): AccountProof {
      const jti = randomUUID()
      return {
        jti,
        issuedAt,
        signature: sign('sha256', accountProofPayload({ operation, binding, issuedAt, jti }), {
          key: pair.privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url'),
      }
    },
  }
}

function github(): GitHubIdentityProvider & { exchanges: Array<{ code: string; verifier: string }> } {
  const exchanges: Array<{ code: string; verifier: string }> = []
  return {
    exchanges,
    authorizationUrl(input) {
      const url = new URL('https://github.com/login/oauth/authorize')
      url.searchParams.set('client_id', 'github-client-development')
      url.searchParams.set('redirect_uri', input.callbackUrl)
      url.searchParams.set('state', input.state)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },
    async exchange(code, verifier) {
      exchanges.push({ code, verifier })
      return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
    },
  }
}

const CONFIG: PlatformAccountConfig = {
  environment: 'development' as const,
  identityNamespace: 'gestalt-development',
  origin: 'https://platform.dev.example.com',
  callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
  tokenSigningKey: Buffer.alloc(32, 7),
  pollingSigningKey: Buffer.alloc(32, 9),
}

function accountHarness(options: {
  backend?: AccountBackend
  invalidation?: MemoryAccountInvalidationBus
  provider?: GitHubIdentityProvider
  clock?: { now(): number }
  config?: PlatformAccountConfig
} = {}) {
  const backend = options.backend ?? new MemoryAccountBackend()
  const invalidation = options.invalidation ?? new MemoryAccountInvalidationBus()
  const provider = options.provider ?? github()
  const clock = options.clock ?? { now: () => NOW }
  const config = options.config ?? CONFIG
  const first = new PlatformAccount(new Context(), { backend, invalidation, github: provider, clock, config })
  const second = new PlatformAccount(new Context(), { backend, invalidation, github: provider, clock, config })
  return { backend, invalidation, provider, clock, config, first, second }
}

async function login(
  account: PlatformAccount,
  key = installationKey(),
  installationId = 'installation-1',
): Promise<{ key: ReturnType<typeof installationKey>; session: Extract<Awaited<ReturnType<PlatformAccount['pollLogin']>>, { status: 'complete' }> }> {
  const attempt = await account.beginLogin({ installationId, installationKind: 'desktop', publicKey: key.publicKey })
  await account.completeGitHubCallback({ code: 'code', state: attempt.state })
  const result = await account.pollLogin({
    attemptId: attempt.id,
    pollingToken: attempt.pollingToken,
    proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
  })
  if (result.status !== 'complete') throw new Error('expected complete login')
  return { key, session: result }
}

function replaceEnvelope(token: string, key: Uint8Array, mutate: (payload: Record<string, unknown>) => void): string {
  const encoded = token.split('.')[0]
  if (encoded === undefined) throw new Error('expected signed token')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>
  mutate(payload)
  return signEncoded(Buffer.from(JSON.stringify(payload)).toString('base64url'), key)
}

function signEncoded(encoded: string, key: Uint8Array): string {
  return `${encoded}.${createHmac('sha256', key).update(encoded).digest('base64url')}`
}

function proxyBackend(base: AccountBackend, overrides: Partial<AccountBackend>): AccountBackend {
  return new Proxy(base, {
    get(target, property) {
      const override = Reflect.get(overrides, property) as unknown
      if (override !== undefined) return override
      return Reflect.get(target, property) as unknown
    },
  })
}

describe('PlatformAccount', () => {
  it('uses one signed five-minute PKCE attempt without requesting a GitHub scope', async () => {
    const provider = github()
    const { first } = accountHarness({ provider })
    const key = installationKey()
    const attempt = await first.beginLogin({
      installationId: 'desktop-installation-1',
      installationKind: 'desktop',
      publicKey: key.publicKey,
    })
    const authorization = new URL(attempt.authorizationUrl)
    expect(authorization.searchParams.has('scope')).toBe(false)
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(attempt.expiresAt).toBe(NOW + LOGIN_ATTEMPT_TTL_MS)

    await expect(first.completeGitHubCallback({ code: 'github-code', state: attempt.state }))
      .resolves.toEqual({ completed: true })
    expect(provider.exchanges).toHaveLength(1)
    expect(provider.exchanges[0]?.verifier).toHaveLength(64)

    const proof = key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`)
    const session = await first.pollLogin({
      attemptId: attempt.id,
      pollingToken: attempt.pollingToken,
      proof,
    })
    expect(session.status).toBe('complete')
    if (session.status !== 'complete') throw new Error('expected complete login')
    expect(session.account).toMatchObject({ githubId: 13994321, githubLogin: 'octocat' })
    expect(session.accessExpiresAt).toBe(NOW + ACCESS_TOKEN_TTL_MS)
    expect(session.refreshExpiresAt).toBe(NOW + MAX_REFRESH_TOKEN_TTL_MS)
    await expect(first.pollLogin({
      attemptId: attempt.id,
      pollingToken: attempt.pollingToken,
      proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
    })).rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_USED' })
  })

  it('rotates refresh tokens and refuses a replayed proof', async () => {
    const { first } = accountHarness()
    const key = installationKey()
    const attempt = await first.beginLogin({
      installationId: 'mobile-installation-1',
      installationKind: 'mobile',
      publicKey: key.publicKey,
    })
    await first.completeGitHubCallback({ code: 'code', state: attempt.state })
    const login = await first.pollLogin({
      attemptId: attempt.id,
      pollingToken: attempt.pollingToken,
      proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
    })
    if (login.status !== 'complete') throw new Error('expected complete login')

    const binding = hashAccountToken(login.refreshToken)
    const proof = key.proof('refresh', binding)
    const refreshed = await first.refresh({ refreshToken: login.refreshToken, proof })
    expect(refreshed.refreshToken).not.toBe(login.refreshToken)
    await expect(first.refresh({ refreshToken: login.refreshToken, proof: key.proof('refresh', binding) }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const currentProof = key.proof('current', hashAccountToken(refreshed.accessToken))
    await expect(first.current({ accessToken: refreshed.accessToken, proof: currentProof })).resolves.toEqual(refreshed.account)
    await expect(first.current({ accessToken: refreshed.accessToken, proof: currentProof }))
      .rejects.toMatchObject({ code: 'PROOF_REPLAYED' })
  })

  it('invalidates and closes only the current installation across instances', async () => {
    const { first, second } = accountHarness()
    const key = installationKey()
    const attempt = await first.beginLogin({
      installationId: 'desktop-installation-2',
      installationKind: 'desktop',
      publicKey: key.publicKey,
    })
    await first.completeGitHubCallback({ code: 'code', state: attempt.state })
    const login = await first.pollLogin({
      attemptId: attempt.id,
      pollingToken: attempt.pollingToken,
      proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
    })
    if (login.status !== 'complete') throw new Error('expected complete login')

    const closed = vi.fn()
    second.trackConnection(login.sessionId, closed)
    await expect(second.current({
      accessToken: login.accessToken,
      proof: key.proof('current', hashAccountToken(login.accessToken)),
    })).resolves.toEqual(login.account)
    await first.signOut({
      accessToken: login.accessToken,
      proof: key.proof('sign-out', hashAccountToken(login.accessToken)),
    })
    expect(closed).toHaveBeenCalledOnce()
    await expect(second.current({
      accessToken: login.accessToken,
      proof: key.proof('current', hashAccountToken(login.accessToken)),
    })).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('rejects a callback with the wrong state without contacting GitHub', async () => {
    const provider = github()
    const { first } = accountHarness({ provider })
    const key = installationKey()
    await first.beginLogin({
      installationId: 'desktop-installation-3',
      installationKind: 'desktop',
      publicKey: key.publicKey,
    })
    await expect(first.completeGitHubCallback({ code: 'code', state: 'wrong-state' }))
      .rejects.toMatchObject({ code: 'LOGIN_STATE_INVALID' })
    expect(provider.exchanges).toHaveLength(0)
  })

  it('returns pending before authorization and replaces only the same installation session', async () => {
    const { first, second } = accountHarness()
    const key = installationKey()
    const attempt = await first.beginLogin({
      installationId: 'desktop-reused', installationKind: 'desktop', publicKey: key.publicKey,
    })
    await expect(first.pollLogin({
      attemptId: attempt.id, pollingToken: attempt.pollingToken,
      proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
    })).resolves.toEqual({ status: 'pending' })
    await first.completeGitHubCallback({ code: 'code', state: attempt.state })
    const initial = await first.pollLogin({
      attemptId: attempt.id, pollingToken: attempt.pollingToken,
      proof: key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
    })
    if (initial.status !== 'complete') throw new Error('expected complete login')
    const closed = vi.fn()
    second.trackConnection(initial.sessionId, closed)

    const replacement = await login(first, key, 'desktop-reused')
    expect(replacement.session.account.id).toBe(initial.account.id)
    expect(closed).toHaveBeenCalledOnce()
    await expect(first.current({
      accessToken: initial.accessToken,
      proof: key.proof('current', hashAccountToken(initial.accessToken)),
    })).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('rejects expired callbacks and invalid provider identities', async () => {
    let now = NOW
    const expiring = accountHarness({ clock: { now: () => now } }).first
    const attempt = await expiring.beginLogin({
      installationId: 'desktop-expired', installationKind: 'desktop', publicKey: installationKey().publicKey,
    })
    now += LOGIN_ATTEMPT_TTL_MS + 1
    await expect(expiring.completeGitHubCallback({ code: 'code', state: attempt.state }))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_EXPIRED' })

    const identities: GitHubIdentity[] = [
      { providerSubject: Number.NaN, login: 'octocat', avatarUrl: 'avatar' },
      { providerSubject: 0, login: 'octocat', avatarUrl: 'avatar' },
      { providerSubject: 1, login: '', avatarUrl: 'avatar' },
      { providerSubject: 1, login: 'octocat', avatarUrl: '' },
    ]
    for (const identity of identities) {
      const provider: GitHubIdentityProvider = {
        authorizationUrl: () => 'https://github.com/login/oauth/authorize',
        exchange: vi.fn().mockResolvedValue(identity),
      }
      const account = accountHarness({ provider }).first
      const next = await account.beginLogin({
        installationId: randomUUID(), installationKind: 'desktop', publicKey: installationKey().publicKey,
      })
      await expect(account.completeGitHubCallback({ code: 'code', state: next.state })).rejects.toThrow()
    }
  })

  it.each([
    { kty: 'RSA', crv: 'P-256', x: 'x', y: 'y' },
    { kty: 'EC', crv: 'P-384', x: 'x', y: 'y' },
    { kty: 'EC', crv: 'P-256', y: 'y' },
    { kty: 'EC', crv: 'P-256', x: 'x' },
    { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private' },
  ])('rejects a non-public P-256 installation key %#', async (publicKey) => {
    await expect(accountHarness().first.beginLogin({
      installationId: 'invalid-key', installationKind: 'desktop', publicKey,
    })).rejects.toMatchObject({ code: 'PROOF_INVALID' })
  })

  it.each([
    { origin: 'http://platform.dev.example.com' },
    { callbackUrl: 'http://platform.dev.example.com/v1/account/oauth/github/callback' },
    { callbackUrl: 'https://other.example.com/v1/account/oauth/github/callback' },
    { callbackUrl: 'https://platform.dev.example.com/wrong' },
    { identityNamespace: ' ' },
    { tokenSigningKey: Buffer.alloc(31) },
    { pollingSigningKey: Buffer.alloc(31) },
  ])('rejects invalid provider config %#', (override) => {
    expect(() => accountHarness({ config: { ...CONFIG, ...override } })).toThrow()
  })

  it('rejects malformed, invalid, expired, and wrongly bound polling tokens', async () => {
    const { first } = accountHarness()
    const key = installationKey()
    const attempt = await first.beginLogin({
      installationId: 'poll-validation', installationKind: 'desktop', publicKey: key.publicKey,
    })
    const proof = () => key.proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`)
    for (const token of ['encoded-only', 'a.b.c']) {
      await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: token, proof: proof() }))
        .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    }
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: 'a.b', proof: proof() }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const badSignature = `${attempt.pollingToken.slice(0, -1)}${attempt.pollingToken.endsWith('A') ? 'B' : 'A'}`
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: badSignature, proof: proof() }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const invalidJson = signEncoded(Buffer.from('{').toString('base64url'), CONFIG.pollingSigningKey)
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: invalidJson, proof: proof() }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })

    const wrongAttempt = replaceEnvelope(attempt.pollingToken, CONFIG.pollingSigningKey, (payload) => { payload.attemptId = 'other' })
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: wrongAttempt, proof: proof() }))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_INVALID' })
    const wrongNamespace = replaceEnvelope(attempt.pollingToken, CONFIG.pollingSigningKey, (payload) => { payload.namespace = 'other' })
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: wrongNamespace, proof: proof() }))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_INVALID' })
    const expired = replaceEnvelope(attempt.pollingToken, CONFIG.pollingSigningKey, (payload) => { payload.expiresAt = NOW - 1 })
    await expect(first.pollLogin({ attemptId: attempt.id, pollingToken: expired, proof: proof() }))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_EXPIRED' })
    const unknown = replaceEnvelope(attempt.pollingToken, CONFIG.pollingSigningKey, (payload) => { payload.attemptId = 'unknown' })
    await expect(first.pollLogin({ attemptId: 'unknown', pollingToken: unknown, proof: proof() }))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_INVALID' })
  })

  it('enforces access-token identity, lifetime, session revision, and account presence', async () => {
    const harness = accountHarness()
    const { key, session } = await login(harness.first)
    const proof = (token: string) => key.proof('current', hashAccountToken(token))
    const expired = replaceEnvelope(session.accessToken, CONFIG.tokenSigningKey, (payload) => { payload.expiresAt = NOW - 1 })
    await expect(harness.first.current({ accessToken: expired, proof: proof(expired) }))
      .rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    const wrongNamespace = replaceEnvelope(session.accessToken, CONFIG.tokenSigningKey, (payload) => { payload.namespace = 'other' })
    await expect(harness.first.current({ accessToken: wrongNamespace, proof: proof(wrongNamespace) }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const unknownSession = replaceEnvelope(session.accessToken, CONFIG.tokenSigningKey, (payload) => { payload.sessionId = 'unknown' })
    await expect(harness.first.current({ accessToken: unknownSession, proof: proof(unknownSession) }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const wrongRevision = replaceEnvelope(session.accessToken, CONFIG.tokenSigningKey, (payload) => { payload.revision = 99 })
    await expect(harness.first.current({ accessToken: wrongRevision, proof: proof(wrongRevision) }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })

    const missingAccount = accountHarness({
      backend: proxyBackend(harness.backend, { getAccount: async () => undefined }),
      invalidation: harness.invalidation,
    }).first
    await expect(missingAccount.current({ accessToken: session.accessToken, proof: proof(session.accessToken) }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('enforces proof time, signature, refresh lifetime, and atomic rotation', async () => {
    let now = NOW
    const harness = accountHarness({ clock: { now: () => now } })
    const { key, session } = await login(harness.first)
    const currentBinding = hashAccountToken(session.accessToken)
    await expect(harness.first.current({
      accessToken: session.accessToken,
      proof: key.proof('current', currentBinding, Number.NaN),
    })).rejects.toMatchObject({ code: 'PROOF_INVALID' })
    await expect(harness.first.current({
      accessToken: session.accessToken,
      proof: key.proof('current', currentBinding, NOW - ACCOUNT_PROOF_WINDOW_MS - 1),
    })).rejects.toMatchObject({ code: 'PROOF_INVALID' })
    await expect(harness.first.current({
      accessToken: session.accessToken,
      proof: { jti: randomUUID(), issuedAt: NOW, signature: 'invalid' },
    })).rejects.toMatchObject({ code: 'PROOF_INVALID' })

    const record = await harness.backend.getSession(session.sessionId)
    if (record === undefined) throw new Error('expected session record')
    const inactive = accountHarness({
      backend: proxyBackend(harness.backend, { getSessionByRefreshHash: async () => ({ ...record, active: false }) }),
      invalidation: harness.invalidation,
      clock: { now: () => now },
    }).first
    await expect(inactive.refresh({
      refreshToken: session.refreshToken,
      proof: key.proof('refresh', hashAccountToken(session.refreshToken)),
    })).rejects.toMatchObject({ code: 'SESSION_REVOKED' })

    const failedRotation = accountHarness({
      backend: proxyBackend(harness.backend, { rotateRefresh: async () => undefined }),
      invalidation: harness.invalidation,
      clock: { now: () => now },
    }).first
    await expect(failedRotation.refresh({
      refreshToken: session.refreshToken,
      proof: key.proof('refresh', hashAccountToken(session.refreshToken)),
    })).rejects.toMatchObject({ code: 'SESSION_REVOKED' })

    now = NOW + MAX_REFRESH_TOKEN_TTL_MS + 1
    await expect(harness.first.refresh({
      refreshToken: session.refreshToken,
      proof: key.proof('refresh', hashAccountToken(session.refreshToken), now),
    })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('handles backend compare-and-mutate failures, proof pruning, and bus disposal', async () => {
    const backend = new MemoryAccountBackend()
    const missingAttempt = 'missing-attempt' as LoginAttemptId
    const missingSession = 'missing-session' as AccountSessionId
    const missingAccount = 'missing-account' as PlatformAccountId
    await expect(backend.authorizeAttempt(missingAttempt, {
      providerSubject: 1, login: 'octocat', avatarUrl: 'avatar',
    })).rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_USED' })
    await expect(backend.consumeAuthorizedAttempt(missingAttempt, 'refresh', NOW))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_INVALID' })
    expect(await backend.getAttempt(missingAttempt)).toBeUndefined()
    expect(await backend.getSession(missingSession)).toBeUndefined()
    expect(await backend.getSessionByRefreshHash('missing')).toBeUndefined()
    expect(await backend.getAccount(missingAccount)).toBeUndefined()
    expect(await backend.rotateRefresh(missingSession, 'old', 'new')).toBeUndefined()
    expect(await backend.revokeSession(missingSession)).toBe(false)

    const key = installationKey()
    await backend.createAttempt({
      id: 'attempt' as LoginAttemptId,
      environment: 'development', identityNamespace: 'namespace', installationId: 'installation',
      installationKind: 'desktop', publicKey: key.publicKey, state: 'state', codeVerifier: 'verifier',
      expiresAt: NOW, status: 'pending',
    })
    expect(await backend.findAttemptByState('state')).toMatchObject({ status: 'pending' })
    await expect(backend.consumeAuthorizedAttempt('attempt' as LoginAttemptId, 'refresh', NOW))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_INVALID' })
    await backend.authorizeAttempt('attempt' as LoginAttemptId, {
      providerSubject: 1, login: 'octocat', avatarUrl: 'avatar',
    })
    await expect(backend.authorizeAttempt('attempt' as LoginAttemptId, {
      providerSubject: 1, login: 'octocat', avatarUrl: 'avatar',
    })).rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_USED' })
    const created = await backend.consumeAuthorizedAttempt('attempt' as LoginAttemptId, 'refresh', NOW)
    await expect(backend.consumeAuthorizedAttempt('attempt' as LoginAttemptId, 'refresh-2', NOW))
      .rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_USED' })
    expect(await backend.rotateRefresh(created.session.id, 'wrong', 'new')).toBeUndefined()
    expect(await backend.revokeSession(created.session.id)).toBe(true)
    expect(await backend.revokeSession(created.session.id)).toBe(false)
    expect(await backend.rotateRefresh(created.session.id, 'refresh', 'new')).toBeUndefined()
    await backend.createAttempt({
      id: 'replacement' as LoginAttemptId,
      environment: 'development', identityNamespace: 'namespace', installationId: 'installation',
      installationKind: 'desktop', publicKey: key.publicKey, state: 'replacement-state', codeVerifier: 'verifier',
      expiresAt: NOW, status: 'pending',
    })
    await backend.authorizeAttempt('replacement' as LoginAttemptId, {
      providerSubject: 1, login: 'octocat', avatarUrl: 'avatar',
    })
    await backend.consumeAuthorizedAttempt('replacement' as LoginAttemptId, 'replacement-refresh', NOW)
    expect(await backend.consumeProof('expired', 1, 0)).toBe(true)
    expect(await backend.consumeProof('current', 3, 2)).toBe(true)
    expect(await backend.consumeProof('current', 3, 2)).toBe(false)

    const bus = new MemoryAccountInvalidationBus()
    const listener = vi.fn()
    const unsubscribe = bus.subscribe(listener)
    bus.publish(created.session.id)
    unsubscribe()
    bus.publish(created.session.id)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('disposes connection subscriptions and avoids publishing an uncommitted revocation', async () => {
    const harness = accountHarness()
    const { key, session } = await login(harness.first)
    const firstClose = vi.fn()
    const secondClose = vi.fn()
    const disposeFirst = harness.first.trackConnection(session.sessionId, firstClose)
    const disposeSecond = harness.first.trackConnection(session.sessionId, secondClose)
    disposeFirst()
    disposeSecond()
    disposeSecond()
    harness.invalidation.publish('unknown' as AccountSessionId)

    harness.first.trackConnection(session.sessionId, firstClose)
    harness.first.dispose()
    expect(firstClose).toHaveBeenCalledOnce()

    const publish = vi.spyOn(harness.invalidation, 'publish')
    const noRevoke = accountHarness({
      backend: proxyBackend(harness.backend, { revokeSession: async () => false }),
      invalidation: harness.invalidation,
    }).first
    await noRevoke.signOut({
      accessToken: session.accessToken,
      proof: key.proof('sign-out', hashAccountToken(session.accessToken)),
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('uses the system clock and disposes through the Cordis effect', async () => {
    const ctx = new Context()
    new PlatformAccount(ctx, {
      backend: new MemoryAccountBackend(), invalidation: new MemoryAccountInvalidationBus(),
      github: github(), config: CONFIG,
    })
    await ctx.fiber.dispose()
  })
})
