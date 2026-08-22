import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import { parseRelayConnectionToken, parseRelayInstanceId } from '@deepseek-ai/dsh-remote-access'
import { parseRelayAttachmentId, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import { PostgresAccountBackend } from '../src/postgres-backend.ts'
import { connectRedis } from '../src/redis-bus.ts'
import { OperatedRemoteAccessResources } from '../src/remote-access-resources.ts'

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
  it('migrates Account, pairing, and route authority in PostgreSQL and coordinates Relay through Redis', async () => {
    const postgres = await startPostgresFixture()
    const redis = await startRedisFixture()
    const pool = new pg.Pool({ host: '127.0.0.1', port: postgres.port, user: 'fixture', database: 'postgres' })
    cleanups.push(async () => { await pool.end() })
    const publisher = await connectRedis({
      host: '127.0.0.1', port: redis.port, username: 'fixture', password: 'fixture-secret', tls: false,
    })
    const subscriber = await connectRedis({
      host: '127.0.0.1', port: redis.port, username: 'fixture', password: 'fixture-secret', tls: false,
    })
    cleanups.push(async () => {
      await Promise.all([publisher.quit(), subscriber.quit()])
    })

    const account = new PostgresAccountBackend('product-entry-fixture', pool)
    await account.migrate()
    const remoteAccess = new OperatedRemoteAccessResources({
      databaseIdentity: 'product-entry-fixture',
      postgres: pool,
      redisCommand: publisher,
      redisSubscriber: subscriber,
      redisKeyPrefix: 'gestalt:relay:fixture',
    })
    await remoteAccess.migrate()

    const accountId = parsePlatformAccountId('account-fixture')
    const installationId = parseInstallationId('desktop-fixture')
    const routeId = parseRelayRouteId('route-fixture')
    await expect(remoteAccess.authority.enableDesktop(accountId, installationId, routeId))
      .resolves.toBe(routeId)
    await expect(remoteAccess.authority.getDesktop(accountId, installationId))
      .resolves.toEqual({ enabled: true, routeId })

    const stopCoordinator = await remoteAccess.coordinator.listen(parseRelayInstanceId('instance-fixture'), async () => {})
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
    await remoteAccess.coordinator.register(directory)
    await expect(remoteAccess.coordinator.locate(routeId, directory.attachmentId)).resolves.toEqual(directory)

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
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('durable fixture did not stop after SIGTERM'))
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveExit()
    })
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
