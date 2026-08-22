/** Production Platform composition: Account HTTP, homepage, and Remote Access tables. */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
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
  type PairingHandshakeProvider,
} from '@deepseek-ai/dsh-remote-access'
import { RemoteRelayProvider } from '@deepseek-ai/dsh-remote-access/relay-provider'
import * as RemoteAccessHttp from '@deepseek-ai/dsh-remote-access-http'
import * as RemoteAccessRelayHttp from '@deepseek-ai/dsh-remote-access-http/relay'
import { connectRedisRelayCoordinator } from '@deepseek-ai/dsh-remote-access-redis'
import pg from 'pg'
import { PostgresAccountBackend } from './postgres-backend.ts'
import { PostgresPersonalPairingAuthorityStore } from './postgres-pairing-store.ts'
import { PostgresRelayRouteStore } from './postgres-route-store.ts'
import {
  assertOperatedPlatformEnvironment,
  readPlatformSigningKey,
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
await backend.migrate()
const pairingAuthority = new PostgresPersonalPairingAuthorityStore(environment.databaseIdentity, postgres)
const relayRouteStore = new PostgresRelayRouteStore(environment.databaseIdentity, postgres)
await pairingAuthority.migrate()
await relayRouteStore.migrate()

const publisher = await connectRedis(redisOptions)
const subscriber = await connectRedis(redisOptions)
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
await ctx.plugin({
  name: 'platform-account-provider',
  apply(inner: Context) {
    new PlatformAccount(inner, {
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
await ctx.plugin(PlatformAccountHttp, { origin: environment.origin })
const relayRedisUrl = new URL(redisOptions.tls ? 'rediss://localhost' : 'redis://localhost')
relayRedisUrl.hostname = redisOptions.host
relayRedisUrl.username = redisOptions.username ?? ''
relayRedisUrl.password = redisOptions.password
const relayRedis = await connectRedisRelayCoordinator({
  url: relayRedisUrl.toString(),
  keyPrefix: `${environment.identityNamespace}:relay`,
})
ctx.effect(() => async () => { await relayRedis.close() }, 'platform: Relay Redis clients')
const relay = new RemoteRelayProvider(ctx, {
  instanceId: parseRelayInstanceId(requiredPlatformEnv('PLATFORM_RELAY_INSTANCE_ID')),
  routeStore: relayRouteStore,
  coordinator: relayRedis.coordinator,
  config: {
    capacityRetryAfterMs: positivePlatformEnv('PLATFORM_RELAY_CAPACITY_RETRY_AFTER_MS'),
    deliveryAckTimeoutMs: positivePlatformEnv('PLATFORM_RELAY_DELIVERY_ACK_TIMEOUT_MS'),
    directoryTtlMs: positivePlatformEnv('PLATFORM_RELAY_DIRECTORY_TTL_MS'),
    heartbeatTimeoutMs: positivePlatformEnv('PLATFORM_RELAY_HEARTBEAT_TIMEOUT_MS'),
    maxBufferedCiphertextBytes: positivePlatformEnv('PLATFORM_RELAY_MAX_BUFFERED_CIPHERTEXT_BYTES'),
    maxConnections: positivePlatformEnv('PLATFORM_RELAY_MAX_CONNECTIONS'),
    maxPendingDeliveries: positivePlatformEnv('PLATFORM_RELAY_MAX_PENDING_DELIVERIES'),
  },
})
new PersonalPairingProvider(ctx, {
  account: ctx.platformAccount,
  handshake: endpointOnlyHandshake(),
  relay,
  authority: pairingAuthority,
  pairingLinkOrigin: `${environment.origin}/pair`,
})
await ctx.plugin(RemoteAccessHttp, { origin: environment.origin })
await ctx.plugin(RemoteAccessRelayHttp, {
  path: '/v1/remote-access/relay',
  attachTimeoutMs: positivePlatformEnv('PLATFORM_RELAY_ATTACH_TIMEOUT_MS'),
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

function endpointOnlyHandshake(): PairingHandshakeProvider {
  return {
    createChallenge: () => Promise.reject(endpointOnlyError()),
    completeChallenge: () => Promise.reject(endpointOnlyError()),
    activatePairing: () => Promise.reject(endpointOnlyError()),
    destroyChallenge: () => {},
    destroyPendingPairing: () => {},
    destroyPairing: () => {},
  }
}

function endpointOnlyError(): Error {
  return new Error('Platform-mediated pairing cryptography is disabled; endpoints must use the opaque mailbox')
}

function positivePlatformEnv(name: string): number {
  const value = Number(requiredPlatformEnv(name))
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}
