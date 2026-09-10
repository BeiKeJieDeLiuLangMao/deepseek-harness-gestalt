import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { CLIProxyAPISupervisor, verifyCLIProxyAPIResource } from '../src/cliproxyapi-runtime.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('CLIProxyAPI packaged resource', () => {
  it('accepts only the current platform/arch and exact digest', async () => {
    const root = await scratch()
    const directory = join(root, 'cliproxyapi')
    await mkdir(directory)
    await writeFile(join(directory, 'cliproxyapi'), 'binary')
    const { createHash } = await import('node:crypto')
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({
      sourceSHA: '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974', platform: process.platform, arch: process.arch,
      path: 'cliproxyapi', sha256: createHash('sha256').update('binary').digest('hex'),
    }))
    await expect(verifyCLIProxyAPIResource(directory, '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974')).resolves.toBe(join(directory, 'cliproxyapi'))
    const manifestPath = join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { sourceSHA: string }
    await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceSHA: '0'.repeat(40) }))
    await expect(verifyCLIProxyAPIResource(directory, '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974')).rejects.toThrow(/resource source/)
    await writeFile(manifestPath, JSON.stringify({ ...manifest }))
    await writeFile(join(directory, 'cliproxyapi'), 'changed')
    await expect(verifyCLIProxyAPIResource(directory, '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974')).rejects.toThrow(/SHA-256/)
  })
})

describe('CLIProxyAPI supervisor', () => {
  it('refuses a reservation race without sending the inference key to the competing listener', async () => {
    const root = await scratch()
    const fixture = await writeFixture(root, 'delayed-fixture', fixtureSource(300))
    let receivedAuthorization: string | undefined
    let competitor: ReturnType<typeof createServer> | undefined
    const supervisor = new CLIProxyAPISupervisor({
      ...fixture,
      stateRoot: join(root, 'state'),
      startupTimeoutMs: 1_000,
      restartLimit: 0,
      afterPortReservation: async (port) => {
        competitor = createServer((request, response) => {
          receivedAuthorization = request.headers.authorization
          response.setHeader('content-type', 'application/json')
          response.end('{"data":[]}')
        })
        await new Promise<void>((resolve, reject) => {
          competitor?.once('error', reject)
          competitor?.listen(port, '127.0.0.1', resolve)
        })
      },
    })
    await expect(supervisor.start()).rejects.toThrow(/before readiness|did not become ready/)
    expect(receivedAuthorization).toBeUndefined()
    expect(competitor?.listening).toBe(true)
    await supervisor.shutdown()
    expect(competitor?.listening).toBe(true)
    await new Promise<void>((resolve) => { competitor?.close(() => { resolve() }) })
  })

  it('does not inherit external dotenv or storage configuration', async () => {
    const root = await scratch()
    const external = join(root, 'external-workspace')
    await mkdir(external)
    await writeFile(join(external, '.env'), 'CLIPROXY_SENTINEL_DOTENV=outside\n')
    const observed = join(root, 'observed.json')
    const fixture = await writeFixture(root, 'environment-fixture', environmentFixtureSource(observed))
    const previousCwd = process.cwd()
    const previous = Object.fromEntries(['PGSTORE_DSN', 'GITSTORE_REPO', 'OBJECTSTORE_URL', 'PROVIDER_CONFIG']
      .map(name => [name, process.env[name]]))
    process.chdir(external)
    process.env.PGSTORE_DSN = 'postgres://external-sentinel'
    process.env.GITSTORE_REPO = 'external-git-sentinel'
    process.env.OBJECTSTORE_URL = 'https://external.invalid/sentinel'
    process.env.PROVIDER_CONFIG = 'external-provider-sentinel'
    try {
      const supervisor = new CLIProxyAPISupervisor({
        ...fixture, stateRoot: join(root, 'state'), startupTimeoutMs: 5_000, restartLimit: 0,
      })
      await supervisor.start()
      const childObservation = JSON.parse(await readFile(observed, 'utf8')) as Record<string, unknown>
      expect(childObservation).toMatchObject({ cwdHasDotenv: false })
      expect(childObservation.HOME).toContain(join('state', ''))
      expect(childObservation.HOME).not.toBe(process.env.HOME)
      await supervisor.shutdown()
    } finally {
      process.chdir(previousCwd)
      restoreEnvironment('PGSTORE_DSN', previous.PGSTORE_DSN)
      restoreEnvironment('GITSTORE_REPO', previous.GITSTORE_REPO)
      restoreEnvironment('OBJECTSTORE_URL', previous.OBJECTSTORE_URL)
      restoreEnvironment('PROVIDER_CONFIG', previous.PROVIDER_CONFIG)
    }
  })

  it('does not send the inference key after shutdown during the TLS handshake', async () => {
    const root = await scratch()
    const observed = join(root, 'authorization.json')
    const fixture = await writeFixture(root, 'handshake-fixture', fixtureSource(0, `globalThis.observed = ${JSON.stringify(observed)}`))
    const supervisor = new CLIProxyAPISupervisor({
      ...fixture,
      stateRoot: join(root, 'state'),
      startupTimeoutMs: 5_000,
      restartLimit: 0,
      afterTlsHandshake: () => { void supervisor.shutdown() },
    })
    await expect(supervisor.start()).rejects.toThrow(/aborted|before readiness|did not become ready/)
    await supervisor.shutdown()
    await expect(stat(observed)).rejects.toThrow()
  })

  it('publishes replacement capabilities with new ports and keys', async () => {
    const root = await scratch()
    const fixture = await writeFixture(root, 'replacement-fixture', fixtureSource())
    const observed: Array<{ baseURL: string; apiKey: string } | undefined> = []
    const supervisor = new CLIProxyAPISupervisor({
      ...fixture, stateRoot: join(root, 'state'), startupTimeoutMs: 5_000, restartLimit: 0,
      onCapability: (capability) => { observed.push(capability) },
    })
    const first = await supervisor.start()
    const second = await supervisor.restart()
    expect(second.capability.baseURL).not.toBe(first.capability.baseURL)
    expect(second.capability.apiKey).not.toBe(first.capability.apiKey)
    expect(observed.filter(Boolean)).toEqual([first.capability, second.capability])
    await supervisor.shutdown()
    expect(observed.at(-1)).toBeUndefined()
  })

  it('forces only its owned child after the graceful-stop bound', async () => {
    const root = await scratch()
    const fixture = await writeFixture(root, 'stubborn-fixture', fixtureSource(0, '', "process.on('SIGTERM', () => {})"))
    const supervisor = new CLIProxyAPISupervisor({
      ...fixture, stateRoot: join(root, 'state'), startupTimeoutMs: 5_000, restartLimit: 0, stopGraceMs: 50,
    })
    const running = await supervisor.start()
    const startedAt = Date.now()
    await supervisor.shutdown()
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    const stopped = await running.exited
    if (process.platform === 'win32') expect(stopped.signal).toBeNull()
    else expect(stopped).toMatchObject({ signal: 'SIGKILL' })
  })

  it('uses isolated state, proves authenticated readiness, and reaches quiescence', async () => {
    const root = await scratch()
    const fixture = await writeFixture(root, 'fixture', fixtureSource())
    const stateRoot = join(root, 'state')
    const supervisor = new CLIProxyAPISupervisor({ ...fixture, stateRoot, startupTimeoutMs: 5_000, restartLimit: 0 })
    const running = await supervisor.start()
    expect(running.capability.provider).toBe('gestalt-account-pool')
    expect(new URL(running.capability.baseURL).protocol).toBe('https:')
    expect(new URL(running.capability.baseURL).hostname).toBe('127.0.0.1')
    expect(running.capability.caPath).toContain(stateRoot)
    const config = await findConfig(stateRoot)
    const text = await readFile(config, 'utf8')
    expect(text).toContain('enable: true')
    expect(text).toContain(`- "${running.capability.apiKey}"`)
    const secretKey = text.match(/secret-key: "([^"]+)"/)?.[1]
    expect(secretKey).toEqual(expect.any(String))
    expect(JSON.stringify(running.capability)).not.toContain(secretKey)
    const probe = await running.management.request({
      authIndex: 'glm-0' as never,
      method: 'GET',
      url: 'https://quota.example.test/usage',
      headers: { Authorization: 'Bearer $TOKEN$' },
    })
    expect(probe.statusCode).toBe(200)
    expect(JSON.parse(probe.bodyText ?? '{}')).toEqual({
      ok: true,
      auth_index: 'glm-0',
      url: 'https://quota.example.test/usage',
    })
    await expect(running.management.request({
      authIndex: '   ' as never,
      method: 'GET',
      url: 'https://quota.example.test/usage',
      headers: { Authorization: 'Bearer $TOKEN$' },
    })).resolves.toMatchObject({ statusCode: 0, error: 'empty account reference' })
    expect(text).not.toContain(process.env.DEEPSEEK_API_KEY ?? '__absent__')
    if (process.platform !== 'win32') expect((await stat(config)).mode & 0o777).toBe(0o600)
    await supervisor.shutdown()
    await expect(running.management.request({
      authIndex: 'glm-0' as never,
      method: 'GET',
      url: 'https://quota.example.test/usage',
      headers: { Authorization: 'Bearer $TOKEN$' },
    })).resolves.toMatchObject({ statusCode: 0, error: /not current|aborted/ })
    await expect(stat(stateRoot)).rejects.toThrow()
    await expect(fetch(new URL('/models', running.capability.baseURL))).rejects.toThrow()
  })
})

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, name)
  else process.env[name] = value
}

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cliproxyapi-'))
  roots.push(root)
  return root
}

async function writeFixture(root: string, name: string, source: string): Promise<{
  binary: string
  binaryArgs?: readonly string[]
}> {
  const script = join(root, `${name}.mjs`)
  await writeFile(script, source)
  if (process.platform !== 'win32') {
    await chmod(script, 0o755)
    return { binary: script }
  }
  return { binary: process.execPath, binaryArgs: [script] }
}

async function findConfig(stateRoot: string): Promise<string> {
  const { readdir } = await import('node:fs/promises')
  const [generation] = await readdir(stateRoot)
  if (generation === undefined) throw new Error('missing generation')
  return join(stateRoot, generation, 'config.yaml')
}

function environmentFixtureSource(observed: string): string {
  return fixtureSource(0, `
import { existsSync } from 'node:fs'
writeFileSync(${JSON.stringify(observed)}, JSON.stringify({
  cwdHasDotenv: existsSync('.env'),
  PGSTORE_DSN: process.env.PGSTORE_DSN,
  GITSTORE_REPO: process.env.GITSTORE_REPO,
  OBJECTSTORE_URL: process.env.OBJECTSTORE_URL,
  PROVIDER_CONFIG: process.env.PROVIDER_CONFIG,
  HOME: process.env.HOME,
}))`)
}

function fixtureSource(delayMs = 0, prelude = '', signalHandler = "process.on('SIGTERM', () => server.close(() => process.exit(0)))"): string {
  return `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:https'
${prelude}
const path = process.argv[process.argv.indexOf('--config') + 1]
const config = readFileSync(path, 'utf8')
const port = Number(config.match(/port: (\\d+)/)[1])
const key = config.match(/api-keys:\\n  - "([^"]+)"/)[1]
const cert = readFileSync(config.match(/cert: "([^"]+)"/)[1])
const keyFile = readFileSync(config.match(/key: "([^"]+)"/)[1])
const authorizationLog = typeof globalThis.observed === 'string' ? globalThis.observed : undefined
const managementKey = config.match(/secret-key: "([^"]+)"/)[1]
const server = createServer({ cert, key: keyFile }, (request, response) => {
  if (authorizationLog !== undefined) writeFileSync(authorizationLog, JSON.stringify({ receivedAuthorization: Boolean(request.headers.authorization) }))
  if (request.url === '/v1/models') {
    if (request.headers.authorization !== 'Bearer ' + key) { response.statusCode = 401; response.end(); return }
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: [] })); return
  }
  if (request.url === '/v0/management/api-call' && request.method === 'POST') {
    if (request.headers.authorization !== 'Bearer ' + managementKey) { response.statusCode = 401; response.end(); return }
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ status_code: 200, body: JSON.stringify({ ok: true, auth_index: body.auth_index, url: body.url }) }))
    })
    return
  }
  response.statusCode = 404
  response.end()
})
setTimeout(() => server.listen(port, '127.0.0.1'), ${String(delayMs)})
${signalHandler}
`
}
