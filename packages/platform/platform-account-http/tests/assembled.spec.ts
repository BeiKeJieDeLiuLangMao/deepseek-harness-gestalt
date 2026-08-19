/** REAL Loader and TCP composition for the complete Platform Account HTTP lifecycle. */

import { webcrypto } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  parseInstallationId,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
} from '@deepseek-ai/dsh-platform-account'
import {
  MemoryInstallationAccountStore,
  PlatformAccountHttpTransport,
  PlatformAccountInstallation,
} from '@deepseek-ai/dsh-platform-account-client'
import {
  ACCESS_TOKEN_TTL_MS,
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  type GitHubIdentityProvider,
} from '@deepseek-ai/dsh-platform-account-core'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as PlatformAccountHttp from '../src/index.ts'

const ENVIRONMENT = selectPlatformEnvironment(validatePlatformEnvironmentPair({
  development: {
    environment: 'development', origin: 'https://platform.dev.example.com',
    callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
    githubClientId: 'assembled-development', credentialReference: 'credentials://development',
    databaseIdentity: 'assembled-database-development', identityNamespace: 'assembled-development',
  },
  production: {
    environment: 'production', origin: 'https://platform.example.com',
    callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
    githubClientId: 'assembled-production', credentialReference: 'credentials://production',
    databaseIdentity: 'assembled-database-production', identityNamespace: 'assembled-production',
  },
}), 'development')

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('real Platform Account HTTP composition', () => {
  it.each([
    { label: 'missing', origin: undefined },
    { label: 'mismatched', origin: 'https://platform.example.com' },
  ])('fails Loader composition for a $label HTTP origin before traffic', async ({ origin }) => {
    let failure: unknown
    try {
      await loadComposition(validationProvider(), origin)
    } catch (error) {
      failure = error
    }
    expect(String(failure)).toContain(
      origin === undefined ? 'origin' : 'does not match the selected Platform environment',
    )
  })

  it('boots Loader and proves P-256 polling, rotation, JSON parsing, and cross-instance sign-out', { timeout: 60_000 }, async () => {
    let now = Date.parse('2026-08-17T10:00:00.000Z')
    const backend = new MemoryAccountBackend(ENVIRONMENT.databaseIdentity)
    const invalidation = new MemoryAccountInvalidationBus()
    let secondary: PlatformAccount | undefined
    let callback: { code: string; state: string } | undefined
    const github: GitHubIdentityProvider = {
      environment: ENVIRONMENT,
      authorizationUrl(input) {
        callback = { code: 'assembled-code', state: input.state }
        const url = new URL('https://github.com/login/oauth/authorize')
        url.searchParams.set('client_id', ENVIRONMENT.githubClientId)
        url.searchParams.set('redirect_uri', input.callbackUrl)
        url.searchParams.set('state', input.state)
        url.searchParams.set('code_challenge', input.codeChallenge)
        url.searchParams.set('code_challenge_method', 'S256')
        return url.href
      },
      async exchange() {
        return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
      },
    }
    const Provider = {
      name: 'assembled-platform-account-provider',
      apply(ctx: Context) {
        const options = {
          backend, invalidation, github, environment: ENVIRONMENT,
          config: { tokenSigningKey: Buffer.alloc(32, 7), pollingSigningKey: Buffer.alloc(32, 9) },
          clock: { now: () => now },
        }
        new PlatformAccount(ctx, options)
        secondary = new PlatformAccount(new Context(), options)
      },
    }
    const loaded = await loadComposition(Provider, ENVIRONMENT.origin)
    const port = loaded.webServer.port
    const requests: Array<{ url: string; init: RequestInit }> = []
    const networkFetch: typeof fetch = async (input, init = {}) => {
      const source = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const headers = new Headers(init.headers)
      headers.set('origin', ENVIRONMENT.origin)
      const target = `http://127.0.0.1:${String(port)}${source.pathname}${source.search}`
      requests.push({ url: source.href, init: { ...init, headers } })
      return fetch(target, { ...init, headers })
    }
    const transport = new PlatformAccountHttpTransport({ environment: ENVIRONMENT, fetch: networkFetch })
    const store = new MemoryInstallationAccountStore()
    const opened = vi.fn()
    const installation = new PlatformAccountInstallation({
      environment: ENVIRONMENT,
      installationId: parseInstallationId('assembled-desktop'),
      installationKind: 'desktop',
      transport,
      store,
      systemBrowser: { open: opened },
      crypto: webcrypto as Crypto,
      now: () => now,
    })

    installation.acceptPrivacy()
    await installation.beginLogin()
    const authorization = new URL(opened.mock.calls[0]?.[0] as string)
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.has('scope')).toBe(false)
    expect(authorization.searchParams.get('redirect_uri')).toBe(ENVIRONMENT.callbackUrl)
    if (callback === undefined) throw new Error('assembled provider did not receive authorization input')
    const callbackResponse = await networkFetch(`${ENVIRONMENT.callbackUrl}?${new URLSearchParams(callback)}`)
    expect(callbackResponse.status).toBe(200)
    const polled = await installation.pollLogin()
    if (polled.status !== 'complete') throw new Error('assembled login remained pending')
    expect(installation.getSnapshot()).toMatchObject({ status: 'signed-in', account: { githubLogin: 'octocat' } })

    const close = vi.fn()
    await secondary?.trackConnection(polled.sessionId, close)
    const initialRefresh = polled.refreshToken
    now += ACCESS_TOKEN_TTL_MS + 1
    await installation.load()
    const rotated = await store.loadSession('development')
    expect(rotated?.session.refreshToken).not.toBe(initialRefresh)
    expect(rotated?.session.refreshExpiresAt).toBe(polled.refreshExpiresAt)

    await installation.signOut()
    expect(close).toHaveBeenCalledOnce()
    expect(await store.loadSession('development')).toBeUndefined()
    const proofRequest = requests.find(request => request.url.endsWith('/v1/account/session'))
    const proofHeaders = new Headers(proofRequest?.init.headers)
    expect(proofHeaders.get('x-gestalt-proof-jti')).not.toBeNull()
    expect(proofHeaders.get('x-gestalt-proof-signature')).not.toBeNull()
    expect(requests.every(request => request.url.startsWith(ENVIRONMENT.origin))).toBe(true)
  })
})

function validationProvider(): unknown {
  return {
    name: 'assembled-platform-account-provider',
    apply(ctx: Context) {
      const backend = new MemoryAccountBackend(ENVIRONMENT.databaseIdentity)
      const github: GitHubIdentityProvider = {
        environment: ENVIRONMENT,
        authorizationUrl: () => 'https://github.com/login/oauth/authorize',
        async exchange() {
          return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
        },
      }
      new PlatformAccount(ctx, {
        backend,
        invalidation: new MemoryAccountInvalidationBus(),
        github,
        environment: ENVIRONMENT,
        config: { tokenSigningKey: Buffer.alloc(32, 7), pollingSigningKey: Buffer.alloc(32, 9) },
      })
    },
  }
}

async function loadComposition(provider: unknown, origin: string | undefined): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-platform-account-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: 'assembled-platform-account-provider'",
    "- name: '@deepseek-ai/dsh-platform-account-http'",
    ...(origin === undefined ? [] : ['  config:', `    origin: '${origin}'`]),
    '',
  ].join('\n'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['assembled-platform-account-provider', provider],
    ['@deepseek-ai/dsh-platform-account-http', PlatformAccountHttp],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return context
}
