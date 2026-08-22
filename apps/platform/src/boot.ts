/** Production Platform composition: Account HTTP, homepage, and Remote Access tables. */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { loadOperatedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
import {
  GitHubOAuthIdentityProvider,
  PlatformAccount,
} from '@deepseek-ai/dsh-platform-account-core'
import * as PlatformAccountHttp from '@deepseek-ai/dsh-platform-account-http'
import pg from 'pg'
import { PostgresAccountBackend } from './postgres-backend.ts'
import { loadOperatedPlatformConfig } from './production-env.ts'
import { RedisAccountInvalidationBus, connectRedis } from './redis-bus.ts'
import { OperatedRemoteAccessResources } from './remote-access-resources.ts'

const config = loadOperatedPlatformConfig(process.env)
const environment = loadOperatedPlatformEnvironment(config.environment)

const postgres = new pg.Pool(config.postgres)

const redisOptions = config.redis

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const backend = new PostgresAccountBackend(environment.databaseIdentity, postgres)
await backend.migrate()

const publisher = await connectRedis(redisOptions)
const subscriber = await connectRedis(redisOptions)
const invalidation = new RedisAccountInvalidationBus(publisher, subscriber)
await invalidation.listen()
const remoteAccess = new OperatedRemoteAccessResources({
  databaseIdentity: environment.databaseIdentity,
  postgres,
  redisCommand: publisher,
  redisSubscriber: subscriber,
  redisKeyPrefix: config.relayRedisKeyPrefix,
})
await remoteAccess.migrate()

const github = new GitHubOAuthIdentityProvider({
  environment,
  credential: {
    reference: environment.credentialReference,
    secret: config.githubClientSecret,
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
        tokenSigningKey: config.tokenSigningKey,
        pollingSigningKey: config.pollingSigningKey,
      },
    })
  },
})
await ctx.plugin(PlatformAccountHttp, { origin: environment.origin })
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
