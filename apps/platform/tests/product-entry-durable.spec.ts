import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import { parseRelayConnectionToken, parseRelayInstanceId } from '@deepseek-ai/dsh-remote-access'
import { parseRelayAttachmentId, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectRedis } from '../src/redis-bus.ts'
import { launchOperatedPlatform } from '../src/launch.ts'

const durableProgramsAvailable = commandAvailable('initdb')
  && commandAvailable('postgres')
  && commandAvailable('redis-server')
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  const results = await Promise.allSettled(cleanups.splice(0).reverse().map(cleanup => cleanup()))
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown)
  }
  if (errors.length > 0) throw new AggregateError(errors, 'durable Platform fixture cleanup failed')
})

describe.skipIf(!durableProgramsAvailable)('operated Platform resource entry with disposable durable fixtures', () => {
  it('launches the product composition with GitHub OAuth, PostgreSQL authority, and Redis coordination', async () => {
    const postgres = await startPostgresFixture()
    const redis = await startRedisFixture()
    const pool = new pg.Pool({ host: '127.0.0.1', port: postgres.port, user: 'fixture', database: 'postgres' })
    const postgresConfigs: unknown[] = []
    const redisConfigs: unknown[] = []
    const githubFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: 'github-fixture-token', scope: '' }))
      .mockResolvedValueOnce(json({
        id: 298347,
        login: 'durable-fixture-account',
        avatar_url: 'https://avatars.example/durable-fixture-account',
      }))
    const running = await launchOperatedPlatform({
      env: operatedFixtureEnv(),
      publicIndex: join(import.meta.dirname, '..', 'public', 'index.html'),
      adapters: {
        createPostgres(config) {
          postgresConfigs.push(config)
          return pool
        },
        async connectRedis(config) {
          redisConfigs.push(config)
          return await connectRedis({
            host: '127.0.0.1', port: redis.port,
            username: 'fixture', password: 'fixture-secret', tls: false,
          })
        },
        githubFetch,
      },
    })
    cleanups.push(running.close)
    expect(postgresConfigs).toEqual([expect.objectContaining({ ssl: { rejectUnauthorized: true } })])
    expect(redisConfigs).toHaveLength(2)
    expect(redisConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ tls: true, username: 'fixture' }),
    ]))

    const publicKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
    const attempt = await running.context.platformAccount.beginLogin({
      installationId: parseInstallationId('desktop-oauth-fixture'),
      installationKind: 'desktop',
      publicKey,
    })
    const authorization = new URL(attempt.authorizationUrl)
    expect(authorization.origin + authorization.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(authorization.searchParams.get('client_id')).toBe('github-client-fixture')
    expect(authorization.searchParams.get('redirect_uri'))
      .toBe('https://platform.fixture.example/v1/account/oauth/github/callback')
    await running.context.platformAccount.completeGitHubCallback({
      code: 'github-code-fixture',
      state: authorization.searchParams.get('state') ?? '',
    })
    expect(githubFetch).toHaveBeenCalledTimes(2)
    const storedAttempt = await pool.query<{ identity: { login: string; providerSubject: number } }>(
      'SELECT identity FROM account_attempts WHERE id = $1',
      [attempt.id],
    )
    expect(storedAttempt.rows[0]?.identity).toEqual(expect.objectContaining({
      login: 'durable-fixture-account', providerSubject: 298347,
    }))

    const accountId = parsePlatformAccountId('account-fixture')
    const installationId = parseInstallationId('desktop-fixture')
    const routeId = parseRelayRouteId('route-fixture')
    await expect(running.remoteAccess.authority.enableDesktop(accountId, installationId, routeId))
      .resolves.toBe(routeId)
    await expect(running.remoteAccess.authority.getDesktop(accountId, installationId))
      .resolves.toEqual({ enabled: true, routeId })

    const stopCoordinator = await running.remoteAccess.coordinator.listen(
      parseRelayInstanceId('instance-fixture'),
      async () => {},
    )
    cleanups.push(stopCoordinator)
    const directory = {
      routeId,
      attachmentId: parseRelayAttachmentId('attachment-fixture'),
      endpoint: 'desktop' as const,
      instanceId: parseRelayInstanceId('instance-fixture'),
      connectionToken: parseRelayConnectionToken('connection-fixture'),
      revision: 1,
      expiresAt: Date.now() + 60_000,
    }
    await running.remoteAccess.coordinator.register(directory)
    await expect(running.remoteAccess.coordinator.locate(routeId, directory.attachmentId)).resolves.toEqual(directory)

    const tables = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE ANY($1)
        ORDER BY tablename`,
      [['account_%', 'remote_access_%']],
    )
    expect(tables.rows.map(row => row.tablename)).toEqual(expect.arrayContaining([
      'account_accounts',
      'account_attempts',
      'account_sessions',
      'remote_access_desktops',
      'remote_access_mobile_pairings',
      'remote_access_pairing_transactions',
      'remote_access_route_authorities',
      'remote_access_routes',
    ]))
  }, 60_000)
})

function operatedFixtureEnv(): NodeJS.Dict<string> {
  return {
    PLATFORM_ENVIRONMENT: 'production',
    PLATFORM_ORIGIN: 'https://platform.fixture.example',
    PLATFORM_GITHUB_CLIENT_ID: 'github-client-fixture',
    PLATFORM_GITHUB_CLIENT_SECRET: 'github-secret-fixture',
    PLATFORM_GITHUB_CALLBACK: 'https://platform.fixture.example/v1/account/oauth/github/callback',
    PLATFORM_GITHUB_CREDENTIAL_REFERENCE: 'credentials://github-oauth/fixture',
    PLATFORM_POSTGRES_HOST: 'postgres.operated.fixture',
    PLATFORM_POSTGRES_USER: 'fixture',
    PLATFORM_POSTGRES_PASSWORD: 'postgres-secret-fixture',
    PLATFORM_POSTGRES_DATABASE: 'product-entry-fixture',
    PLATFORM_IDENTITY_NAMESPACE: 'identity-fixture',
    PLATFORM_REDIS_HOST: 'redis.operated.fixture',
    PLATFORM_REDIS_USER: 'fixture',
    PLATFORM_REDIS_PASSWORD: 'redis-secret-fixture',
    PLATFORM_RELAY_REDIS_KEY_PREFIX: 'gestalt:relay:fixture',
    PLATFORM_TOKEN_SIGNING_KEY: 'ab'.repeat(32),
    PLATFORM_POLLING_SIGNING_KEY: 'cd'.repeat(32),
    PLATFORM_POSTGRES_SSL: 'require',
    PLATFORM_REDIS_TLS: '1',
    PLATFORM_LISTEN_HOST: '127.0.0.1',
    PORT: '0',
  }
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function commandAvailable(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

async function startPostgresFixture(): Promise<{ port: number }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-operated-postgres-'))
  const data = join(root, 'data')
  const initialized = spawnSync('initdb', [
    '-D', data, '-A', 'trust', '-U', 'fixture', '--no-locale', '--encoding=UTF8',
  ], { encoding: 'utf8' })
  if (initialized.status !== 0) throw new Error(`initdb fixture failed: ${initialized.stderr}`)
  const port = await freePort()
  const child = spawn('postgres', ['-D', data, '-h', '127.0.0.1', '-p', String(port)], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const stderr = captureStderr(child)
  cleanups.push(async () => {
    await stopChild(child)
    await rm(root, { recursive: true, force: true })
  })
  await waitForPostgres(port, stderr)
  return { port }
}

async function startRedisFixture(): Promise<{ port: number }> {
  const port = await freePort()
  const child = spawn('redis-server', [
    '--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no',
    '--user', 'default', 'off', '--user', 'fixture', 'on', '>fixture-secret', '~*', '&*', '+@all',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const stderr = captureStderr(child)
  cleanups.push(async () => { await stopChild(child) })
  await waitForPort(port, child, stderr)
  return { port }
}

async function waitForPostgres(port: number, stderr: () => string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const probe = new pg.Client({ host: '127.0.0.1', port, user: 'fixture', database: 'postgres' })
    try {
      await probe.connect()
      await probe.end()
      return
    } catch {
      await probe.end().catch(() => {})
      await delay(50)
    }
  }
  throw new Error(`PostgreSQL fixture did not become ready: ${stderr()}`)
}

async function waitForPort(port: number, child: ChildProcess, stderr: () => string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`durable fixture exited early: ${stderr()}`)
    const open = await new Promise<boolean>((resolveOpen) => {
      const socket = createServer().listen({ host: '127.0.0.1', port, exclusive: true })
      socket.once('error', () => { resolveOpen(true) })
      socket.once('listening', () => { socket.close(() => { resolveOpen(false) }) })
    })
    if (open) return
    await delay(50)
  }
  throw new Error(`durable fixture port did not become ready: ${stderr()}`)
}

function captureStderr(child: ChildProcess): () => string {
  let output = ''
  child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
  return () => output.slice(-4_000)
}

async function stopChild(child: ChildProcess): Promise<void> {
  const exited = childExit(child)
  if (child.exitCode !== null) {
    await exited
    return
  }
  child.kill('SIGTERM')
  const escalation = setTimeout(() => {
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }, 5_000)
  try {
    await Promise.race([
      exited,
      delay(10_000).then(() => { throw new Error('durable fixture did not exit after SIGKILL') }),
    ])
  } finally {
    clearTimeout(escalation)
  }
}

function childExit(child: ChildProcess): Promise<void> {
  return new Promise((resolveExit) => {
    const onExit = (): void => { resolveExit() }
    child.once('exit', onExit)
    if (child.exitCode !== null) {
      child.off('exit', onExit)
      resolveExit()
    }
  })
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('fixture failed to allocate a TCP port'))
        return
      }
      server.close((error) => { if (error === undefined) resolvePort(address.port); else reject(error) })
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => { setTimeout(resolveDelay, ms) })
}
