import { readFileSync } from 'node:fs'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { connect as connectTls, createServer as createTlsServer } from 'node:tls'
import type { RedisClientType } from 'redis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  mobileInstallationRevocationBinding,
  parseAccountProofJti,
  parseInstallationId,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
  type AccountProof,
} from '@deepseek-ai/dsh-platform-account'
import {
  MemoryAccountBackend,
  PlatformAccount,
  accountProofPayload,
  hashAccountToken,
} from '@deepseek-ai/dsh-platform-account-core'

interface CapturedRedisOptions {
  socket?: {
    ca?: string
    host?: string
    port?: number
    rejectUnauthorized?: boolean
    servername?: string
    tls?: boolean
  }
}

const redis = vi.hoisted(() => ({
  createClient: vi.fn<(options?: CapturedRedisOptions) => RedisClientType>(),
}))

vi.mock('redis', () => ({ createClient: redis.createClient }))

import { connectRedis, RedisAccountInvalidationBus } from '../src/redis-bus.ts'

const TLS_CERTIFICATE = readFileSync(
  new URL('../../../packages/platform/remote-access-http/tests/fixtures/localhost-cert.pem', import.meta.url),
  'utf8',
)
const TLS_PRIVATE_KEY = readFileSync(
  new URL('../../../packages/platform/remote-access-http/tests/fixtures/localhost-key.pem', import.meta.url),
  'utf8',
)

describe('operated Redis connection ownership', () => {
  beforeEach(() => {
    redis.createClient.mockReset()
  })

  it('destroys a failed connection and removes its process error listener', async () => {
    const failure = new Error('Redis connect failed')
    const fixture = fakeRedisClient({ connect: async () => { throw failure } })
    redis.createClient.mockReturnValue(fixture.client)

    await expect(connectRedis(redisOptions())).rejects.toBe(failure)

    expect(fixture.client.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(fixture.client.destroy).toHaveBeenCalledOnce()
    expectResourcesReleased(fixture.state)
  })

  it('rejects a trusted Redis certificate for a different hostname', async () => {
    const fixture = fakeRedisClient()
    redis.createClient.mockReturnValue(fixture.client)
    const connection = await connectRedis({
      ...redisOptions(), host: 'redis.invalid.example', ca: TLS_CERTIFICATE,
    })
    const socketOptions = redis.createClient.mock.calls[0]?.[0]?.socket
    await connection.close()
    if (socketOptions === undefined
      || socketOptions.host === undefined
      || socketOptions.port === undefined
      || socketOptions.servername === undefined) {
      throw new TypeError('expected complete Redis TLS socket options')
    }

    const server = createTlsServer({ cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new TypeError('expected TCP server address')
      const failure = await new Promise<Error>((resolve, reject) => {
        const socket = connectTls({
          ca: socketOptions.ca,
          host: '127.0.0.1',
          port: address.port,
          rejectUnauthorized: socketOptions.rejectUnauthorized,
          servername: socketOptions.servername,
        }, () => {
          socket.destroy()
          reject(new Error('TLS accepted a Redis certificate for a different hostname'))
        })
        socket.once('error', resolve)
      })
      expect(failure).toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
      })
    }
  })

  it('uses the maintained graceful close and releases every process resource', async () => {
    const fixture = fakeRedisClient()
    redis.createClient.mockReturnValue(fixture.client)

    const connection = await connectRedis(redisOptions())
    expect(connection.client).toBe(fixture.client)
    expect(redis.createClient.mock.calls[0]?.[0]?.socket)
      .toEqual({
        ca: 'fixture-ca', host: 'redis.fixture.example', port: 6379,
        rejectUnauthorized: true, servername: 'redis.fixture.example', tls: true,
      })
    expect(fixture.state.errorListeners).toHaveLength(1)

    await connection.close()

    expect(fixture.client.close).toHaveBeenCalledOnce()
    expect(fixture.client.quit).not.toHaveBeenCalled()
    expect(fixture.client.destroy).not.toHaveBeenCalled()
    expectResourcesReleased(fixture.state)
  })

  it('preserves a graceful-close failure after that close has released its resources', async () => {
    const closeFailure = new Error('Redis close failed after release')
    const fixture = fakeRedisClient({
      async close(state) {
        releaseResources(state)
        throw closeFailure
      },
    })
    redis.createClient.mockReturnValue(fixture.client)
    const connection = await connectRedis(redisOptions())

    await expect(connection.close()).rejects.toBe(closeFailure)

    expect(fixture.client.destroy).not.toHaveBeenCalled()
    expectResourcesReleased(fixture.state)
  })

  it('destroys an open client after graceful close rejects', async () => {
    const closeFailure = new Error('Redis close failed while open')
    const fixture = fakeRedisClient({ close: async () => { throw closeFailure } })
    redis.createClient.mockReturnValue(fixture.client)
    const connection = await connectRedis(redisOptions())

    await expect(connection.close()).rejects.toBe(closeFailure)

    expect(fixture.client.destroy).toHaveBeenCalledOnce()
    expectResourcesReleased(fixture.state)
  })

  it('preserves both close and destroy failures after the client is quiescent', async () => {
    const closeFailure = new Error('Redis close failed while open')
    const destroyFailure = new Error('Redis destroy reported cleanup failure')
    const fixture = fakeRedisClient({
      close: async () => { throw closeFailure },
      destroy: () => { throw destroyFailure },
    })
    redis.createClient.mockReturnValue(fixture.client)
    const connection = await connectRedis(redisOptions())
    let failure: unknown

    try {
      await connection.close()
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new TypeError('expected AggregateError')
    expect(failure.errors).toEqual([closeFailure, destroyFailure])
    expectResourcesReleased(fixture.state)
  })

  it('recovers a durable Mobile invalidation after the Redis publisher returns', async () => {
    vi.useFakeTimers()
    const environment = selectPlatformEnvironment(validatePlatformEnvironmentPair({
      development: {
        environment: 'development', origin: 'https://platform.dev.example.com',
        callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
        githubClientId: 'redis-development', credentialReference: 'credentials://redis-development',
        databaseIdentity: 'redis-development', identityNamespace: 'redis-development',
      },
      production: {
        environment: 'production', origin: 'https://platform.example.com',
        callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
        githubClientId: 'redis-production', credentialReference: 'credentials://redis-production',
        databaseIdentity: 'redis-production', identityNamespace: 'redis-production',
      },
    }), 'development')
    const backend = new MemoryAccountBackend(environment.databaseIdentity)
    const publish = vi.fn()
      .mockRejectedValueOnce(new Error('Redis publisher unavailable'))
      .mockResolvedValue(1)
    const bus = new RedisAccountInvalidationBus(
      { publish } as unknown as RedisClientType,
      {} as RedisClientType,
    )
    const github = {
      environment,
      authorizationUrl(input: { callbackUrl: string; state: string; codeChallenge: string }) {
        const url = new URL('https://github.com/login/oauth/authorize')
        url.searchParams.set('state', input.state)
        return url.toString()
      },
      async exchange() {
        return { providerSubject: 902, login: 'redis-user', avatarUrl: 'https://avatars.example/redis-user' }
      },
    }
    const options = {
      backend, invalidation: bus, github, environment,
      clock: { now: () => 1_000 },
      config: {
        tokenSigningKey: Buffer.alloc(32, 7),
        pollingSigningKey: Buffer.alloc(32, 9),
        sessionInvalidationRetryIntervalMs: 100,
      },
    }
    const first = new PlatformAccount(new Context(), options)
    const second = new PlatformAccount(new Context(), {
      ...options,
      config: { ...options.config, sessionInvalidationRetryIntervalMs: 60_000 },
    })
    try {
      const desktop = await redisLogin(first, 'redis-desktop', 'desktop')
      const mobile = await redisLogin(first, 'redis-mobile', 'mobile')
      const close = vi.fn()
      await second.trackConnection(mobile.session.sessionId, close)
      await expect(first.revokeMobileInstallation({
        accessToken: desktop.session.accessToken,
        installationId: parseInstallationId('redis-mobile'),
        proof: desktop.proof(
          'revoke-mobile-installation',
          mobileInstallationRevocationBinding(
            hashAccountToken(desktop.session.accessToken),
            parseInstallationId('redis-mobile'),
          ),
        ),
      })).rejects.toThrow('not fully published')
      expect(close).not.toHaveBeenCalled()
      await expect(backend.pendingMobileSessionInvalidations(environment.identityNamespace))
        .resolves.toEqual([mobile.session.sessionId])

      await vi.advanceTimersByTimeAsync(100)

      expect(close).toHaveBeenCalledOnce()
      expect(publish).toHaveBeenCalledTimes(2)
      await expect(backend.pendingMobileSessionInvalidations(environment.identityNamespace)).resolves.toEqual([])
    } finally {
      await first.dispose()
      await second.dispose()
      vi.useRealTimers()
    }
  })
})

async function redisLogin(
  account: PlatformAccount,
  installationId: string,
  installationKind: 'desktop' | 'mobile',
) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const attempt = await account.beginLogin(installationKind === 'desktop'
    ? {
      installationId: parseInstallationId(installationId), installationKind,
      presentation: { name: installationId, platform: 'linux' }, publicKey: pair.publicKey.export({ format: 'jwk' }),
    }
    : {
      installationId: parseInstallationId(installationId), installationKind,
      presentation: { name: installationId, platform: 'ios' }, publicKey: pair.publicKey.export({ format: 'jwk' }),
    })
  await account.completeGitHubCallback({ code: 'code', state: attempt.state })
  const proof = (operation: string, binding: string): AccountProof => {
    const jti = parseAccountProofJti(randomUUID())
    return {
      jti,
      issuedAt: 1_000,
      signature: sign('sha256', accountProofPayload({ operation, binding, issuedAt: 1_000, jti }), {
        key: pair.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url'),
    }
  }
  const session = await account.pollLogin({
    attemptId: attempt.id,
    pollingToken: attempt.pollingToken,
    proof: proof('login-poll', `${attempt.id}:${hashAccountToken(attempt.pollingToken)}`),
  })
  if (session.status !== 'complete') throw new Error('expected complete Redis fixture login')
  return { session, proof }
}

function redisOptions() {
  return {
    host: 'redis.fixture.example', port: 6379, username: 'fixture', password: 'secret',
    tls: true as const, ca: 'fixture-ca',
  }
}

interface FakeRedisState {
  isOpen: boolean
  timerOwned: boolean
  socketOwned: boolean
  errorListeners: Set<unknown>
}

interface FakeRedisHooks {
  connect?(): Promise<void>
  close?(state: FakeRedisState): Promise<void>
  destroy?(state: FakeRedisState): void
}

function fakeRedisClient(hooks: FakeRedisHooks = {}) {
  const state: FakeRedisState = {
    isOpen: false,
    timerOwned: false,
    socketOwned: false,
    errorListeners: new Set(),
  }
  const client = {
    get isOpen() { return state.isOpen },
    on: vi.fn((event: string, listener: unknown) => {
      if (event === 'error') state.errorListeners.add(listener)
    }),
    removeListener: vi.fn((event: string, listener: unknown) => {
      if (event === 'error') state.errorListeners.delete(listener)
    }),
    connect: vi.fn(async () => {
      await hooks.connect?.()
      state.isOpen = true
      state.timerOwned = true
      state.socketOwned = true
    }),
    close: vi.fn(async () => {
      if (hooks.close !== undefined) {
        await hooks.close(state)
        return
      }
      releaseResources(state)
    }),
    destroy: vi.fn(() => {
      releaseResources(state)
      hooks.destroy?.(state)
    }),
    quit: vi.fn(async () => {
      releaseResources(state)
      return 'OK'
    }),
  }
  return { client: client as unknown as RedisClientType & typeof client, state }
}

function releaseResources(state: FakeRedisState): void {
  state.isOpen = false
  state.timerOwned = false
  state.socketOwned = false
}

function expectResourcesReleased(state: FakeRedisState): void {
  expect(state).toMatchObject({ isOpen: false, timerOwned: false, socketOwned: false })
  expect(state.errorListeners).toHaveLength(0)
}
