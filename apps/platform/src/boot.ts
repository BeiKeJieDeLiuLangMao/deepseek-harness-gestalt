/** Production Platform composition: Account HTTP + static homepage. */

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
import pg from 'pg'
import { PostgresAccountBackend } from './postgres-backend.ts'
import { RedisAccountInvalidationBus, connectRedis } from './redis-bus.ts'

const REQUIRED = [
  'PLATFORM_ORIGIN',
  'PLATFORM_GITHUB_CLIENT_ID',
  'PLATFORM_GITHUB_CLIENT_SECRET',
  'PLATFORM_GITHUB_CALLBACK',
  'PLATFORM_POSTGRES_HOST',
  'PLATFORM_POSTGRES_USER',
  'PLATFORM_POSTGRES_PASSWORD',
  'PLATFORM_REDIS_HOST',
  'PLATFORM_REDIS_PASSWORD',
  'PLATFORM_TOKEN_SIGNING_KEY',
  'PLATFORM_POLLING_SIGNING_KEY',
] as const

function required(name: (typeof REQUIRED)[number]): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`platform: missing deployment secrets: ${name}`)
  }
  return value
}

function hexKey(name: 'PLATFORM_TOKEN_SIGNING_KEY' | 'PLATFORM_POLLING_SIGNING_KEY'): Uint8Array {
  const hex = required(name)
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new TypeError(`${name} must be 32 bytes of hex`)
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

const origin = required('PLATFORM_ORIGIN')
const callback = required('PLATFORM_GITHUB_CALLBACK')
const environment = loadPlatformEnvironment({
  selection: process.env.PLATFORM_ENVIRONMENT ?? 'production',
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
    githubClientId: required('PLATFORM_GITHUB_CLIENT_ID'),
    credentialReference: process.env.PLATFORM_GITHUB_CREDENTIAL_REFERENCE ?? 'credentials://github-oauth/production',
    databaseIdentity: process.env.PLATFORM_POSTGRES_DATABASE ?? 'gestalt',
    identityNamespace: process.env.PLATFORM_IDENTITY_NAMESPACE ?? 'gestalt-production',
  },
})

const postgres = new pg.Pool({
  host: required('PLATFORM_POSTGRES_HOST'),
  port: Number(process.env.PLATFORM_POSTGRES_PORT ?? '5432'),
  user: required('PLATFORM_POSTGRES_USER'),
  password: required('PLATFORM_POSTGRES_PASSWORD'),
  database: process.env.PLATFORM_POSTGRES_DATABASE ?? 'gestalt',
  ssl: process.env.PLATFORM_POSTGRES_SSL === 'disable' ? false : { rejectUnauthorized: false },
})

const redisUser = process.env.PLATFORM_REDIS_USER
const redisOptions = {
  host: required('PLATFORM_REDIS_HOST'),
  password: required('PLATFORM_REDIS_PASSWORD'),
  tls: process.env.PLATFORM_REDIS_TLS !== '0',
  ...(redisUser === undefined || redisUser === '' ? {} : { username: redisUser }),
}

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const backend = new PostgresAccountBackend(environment.databaseIdentity, postgres)
await backend.migrate()

const publisher = await connectRedis(redisOptions)
const subscriber = await connectRedis(redisOptions)
const invalidation = new RedisAccountInvalidationBus(publisher, subscriber)
await invalidation.listen()

const github = new GitHubOAuthIdentityProvider({
  environment,
  credential: {
    reference: environment.credentialReference,
    secret: required('PLATFORM_GITHUB_CLIENT_SECRET'),
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
        tokenSigningKey: hexKey('PLATFORM_TOKEN_SIGNING_KEY'),
        pollingSigningKey: hexKey('PLATFORM_POLLING_SIGNING_KEY'),
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
