/** Production Platform composition: Account HTTP, Snow Personal Pairing, and Relay WSS. */

import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
import { SnowPairingHandshakeProvider } from '@deepseek-ai/dsh-noise-channel'
import {
  loadPlatformEnvironment,
} from '@deepseek-ai/dsh-platform-account'
import {
  GitHubOAuthIdentityProvider,
  PlatformAccount,
} from '@deepseek-ai/dsh-platform-account-core'
import * as PlatformAccountHttp from '@deepseek-ai/dsh-platform-account-http'
import {
  PersonalPairingProvider,
  parseRelayInstanceId,
} from '@deepseek-ai/dsh-remote-access'
import { RemoteRelayProvider } from '@deepseek-ai/dsh-remote-access/relay-provider'
import * as RemoteAccessHttp from '@deepseek-ai/dsh-remote-access-http'
import * as RemoteAccessRelay from '@deepseek-ai/dsh-remote-access-http/relay'
import { RedisRelayCoordinator, type RelayRedisClient } from '@deepseek-ai/dsh-remote-access-redis'
import pg from 'pg'
import { PostgresAccountBackend } from './postgres-backend.ts'
import { PostgresPersonalPairingAuthorityStore } from './postgres-pairing-store.ts'
import { PostgresRelayRouteStore } from './postgres-route-store.ts'
import {
  assertOperatedPlatformEnvironment,
  readPlatformSigningKey,
  readPositiveIntegerPlatformEnv,
  requiredPlatformEnv,
} from './production-env.ts'
import { RedisAccountInvalidationBus, connectRedis } from './redis-bus.ts'

const operated = assertOperatedPlatformEnvironment(process.env.PLATFORM_ENVIRONMENT)
const origin = requiredPlatformEnv('PLATFORM_ORIGIN')
const callback = requiredPlatformEnv('PLATFORM_GITHUB_CALLBACK')
const environment = loadPlatformEnvironment({
  selection: operated,
  // Pair member only: the listen process never selects development.
  development: {
    origin: 'https://dev.gestaltrun.invalid',
    callbackUrl: 'https://dev.gestaltrun.invalid/v1/account/oauth/github/callback',
    githubClientId: 'gestalt-development-unused',
    credentialReference: 'credentials://github-oauth/development',
    databaseIdentity: 'gestalt-account-development',
    identityNamespace: 'gestalt-development',
  },
  production: {
    origin,
    callbackUrl: callback,
    githubClientId: requiredPlatformEnv('PLATFORM_GITHUB_CLIENT_ID'),
    credentialReference: process.env.PLATFORM_GITHUB_CREDENTIAL_REFERENCE ?? 'credentials://github-oauth/production',
    databaseIdentity: process.env.PLATFORM_POSTGRES_DATABASE ?? 'gestalt',
    identityNamespace: process.env.PLATFORM_IDENTITY_NAMESPACE ?? 'gestalt-production',
  },
})

const postgres = new pg.Pool({
  host: requiredPlatformEnv('PLATFORM_POSTGRES_HOST'),
  port: Number(process.env.PLATFORM_POSTGRES_PORT ?? '5432'),
  user: requiredPlatformEnv('PLATFORM_POSTGRES_USER'),
  password: requiredPlatformEnv('PLATFORM_POSTGRES_PASSWORD'),
  database: process.env.PLATFORM_POSTGRES_DATABASE ?? 'gestalt',
  ssl: process.env.PLATFORM_POSTGRES_SSL === 'disable' ? false : { rejectUnauthorized: false },
})

const redisUser = process.env.PLATFORM_REDIS_USER
const redisOptions = {
  host: requiredPlatformEnv('PLATFORM_REDIS_HOST'),
  password: requiredPlatformEnv('PLATFORM_REDIS_PASSWORD'),
  tls: process.env.PLATFORM_REDIS_TLS !== '0',
  ...(redisUser === undefined || redisUser === '' ? {} : { username: redisUser }),
}

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const backend = new PostgresAccountBackend(environment.databaseIdentity, postgres)
const pairingStore = new PostgresPersonalPairingAuthorityStore(environment.databaseIdentity, postgres)
const routeStore = new PostgresRelayRouteStore(environment.databaseIdentity, postgres)
await backend.migrate()
await pairingStore.migrate()
await routeStore.migrate()

const publisher = await connectRedis(redisOptions)
const subscriber = await connectRedis(redisOptions)
const relayCommand = await connectRedis(redisOptions)
const relaySubscriber = await connectRedis(redisOptions)
const invalidation = new RedisAccountInvalidationBus(publisher, subscriber)
await invalidation.listen()

const github = new GitHubOAuthIdentityProvider({
  environment,
  credential: {
    reference: environment.credentialReference,
    secret: requiredPlatformEnv('PLATFORM_GITHUB_CLIENT_SECRET'),
  },
})

const ctx = new Context()
await ctx.plugin(WebServer, {
  host: process.env.PLATFORM_LISTEN_HOST === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0',
  port: Number(process.env.PORT ?? '8080'),
})
const accountHolder: { account?: PlatformAccount } = {}
await ctx.plugin({
  name: 'platform-account-provider',
  apply(inner: Context) {
    accountHolder.account = new PlatformAccount(inner, {
      backend,
      invalidation,
      github,
      environment,
      config: {
        tokenSigningKey: readPlatformSigningKey('PLATFORM_TOKEN_SIGNING_KEY'),
        pollingSigningKey: readPlatformSigningKey('PLATFORM_POLLING_SIGNING_KEY'),
      },
    })
  },
})
if (accountHolder.account === undefined) throw new TypeError('platform: Account service failed to start')
const coordinator = new RedisRelayCoordinator({
  command: asRelayRedis(relayCommand),
  subscriber: asRelayRedis(relaySubscriber),
  keyPrefix: 'dsh:gestalt:relay',
})
const relay = new RemoteRelayProvider(ctx, {
  instanceId: parseRelayInstanceId(relayInstanceId()),
  routeStore,
  coordinator,
  config: {
    capacityRetryAfterMs: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_CAPACITY_RETRY_AFTER_MS'),
    deliveryAckTimeoutMs: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_DELIVERY_ACK_TIMEOUT_MS'),
    directoryTtlMs: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_DIRECTORY_TTL_MS'),
    heartbeatTimeoutMs: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_HEARTBEAT_TIMEOUT_MS'),
    maxBufferedCiphertextBytes: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_MAX_BUFFERED_CIPHERTEXT_BYTES'),
    maxConnections: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_MAX_CONNECTIONS'),
    maxPendingDeliveries: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_MAX_PENDING_DELIVERIES'),
  },
})
new PersonalPairingProvider(ctx, {
  account: accountHolder.account,
  handshake: new SnowPairingHandshakeProvider(),
  relay,
  authority: pairingStore,
  pairingLinkOrigin: `${environment.origin}/pair`,
})
await ctx.plugin(PlatformAccountHttp, { origin: environment.origin })
await ctx.plugin(RemoteAccessHttp, { origin: environment.origin })
await ctx.plugin(RemoteAccessRelay, {
  path: '/v1/remote-access/relay',
  attachTimeoutMs: readPositiveIntegerPlatformEnv('PLATFORM_RELAY_ATTACH_TIMEOUT_MS'),
})
ctx.webServer.register({
  kind: 'exact',
  path: '/healthz',
  handler(_req, res) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true }))
  },
})
ctx.webServer.register({
  kind: 'exact',
  path: '/readyz',
  handler(_req, res) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true }))
  },
})
await ctx.plugin(FrontendStatic, { distIndex: join(publicRoot, 'index.html') })
console.error(`platform: listening on ${ctx.webServer.host}:${String(ctx.webServer.port)}`)

function relayInstanceId(): string {
  const raw = process.env.PLATFORM_RELAY_INSTANCE_ID ?? hostname()
  const id = raw.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+/, '').slice(0, 128)
  return id === '' ? 'platform' : id
}

function asRelayRedis(client: {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options: { PX: number }): Promise<unknown>
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
  publish(channel: string, message: string): Promise<number>
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>
  unsubscribe(channel: string, listener: (message: string) => void): Promise<unknown>
}): RelayRedisClient {
  const wrap = (signal?: AbortSignal): RelayRedisClient => ({
    get: key => withOptionalAbort(signal, () => client.get(key)),
    set: (key, value, options) => withOptionalAbort(signal, () => client.set(key, value, options)),
    eval: (script, options) => withOptionalAbort(signal, () => client.eval(script, options)),
    publish: (channel, message) => withOptionalAbort(signal, () => client.publish(channel, message)),
    subscribe: (channel, listener) => withOptionalAbort(signal, () => client.subscribe(channel, listener)),
    unsubscribe: (channel, listener) => withOptionalAbort(signal, () => client.unsubscribe(channel, listener)),
    withAbortSignal: inner => wrap(inner),
  })
  return wrap()
}

async function withOptionalAbort<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  if (signal === undefined) return await operation()
  signal.throwIfAborted()
  return await Promise.race([
    operation(),
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('Relay Redis command aborted'))
      }, { once: true })
    }),
  ])
}
