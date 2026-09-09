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
    await expect(verifyCLIProxyAPIResource(directory)).resolves.toBe(join(directory, 'cliproxyapi'))
    const manifestPath = join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { sourceSHA: string }
    await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceSHA: '0'.repeat(40) }))
    await expect(verifyCLIProxyAPIResource(directory)).rejects.toThrow(/resource source/)
    await writeFile(manifestPath, JSON.stringify({ ...manifest }))
    await writeFile(join(directory, 'cliproxyapi'), 'changed')
    await expect(verifyCLIProxyAPIResource(directory)).rejects.toThrow(/SHA-256/)
  })
})

describe('CLIProxyAPI supervisor', () => {
  it('refuses a reservation race without sending the inference key to the competing listener', async () => {
    const root = await scratch()
    const executable = join(root, 'delayed-fixture.mjs')
    await writeFile(executable, fixtureSource(300))
    await chmod(executable, 0o755)
    let receivedAuthorization: string | undefined
    let competitor: ReturnType<typeof createServer> | undefined
    const supervisor = new CLIProxyAPISupervisor({
      binary: executable,
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
    await new Promise<void>(resolve => competitor?.close(() => resolve()))
  })

  it('uses isolated state, proves authenticated readiness, and reaches quiescence', async () => {
    const root = await scratch()
    const executable = join(root, 'fixture.mjs')
    await writeFile(executable, fixtureSource())
    await chmod(executable, 0o755)
    const stateRoot = join(root, 'state')
    const supervisor = new CLIProxyAPISupervisor({ binary: executable, stateRoot, startupTimeoutMs: 5_000, restartLimit: 0 })
    const running = await supervisor.start()
    expect(running.capability.provider).toBe('gestalt-account-pool')
    expect(new URL(running.capability.baseURL).hostname).toBe('127.0.0.1')
    const config = await findConfig(stateRoot)
    const text = await readFile(config, 'utf8')
    expect(text).toContain(`- "${running.capability.apiKey}"`)
    expect(text).not.toContain(process.env.DEEPSEEK_API_KEY ?? '__absent__')
    expect((await stat(config)).mode & 0o777).toBe(0o600)
    await supervisor.shutdown()
    await expect(stat(stateRoot)).rejects.toThrow()
    await expect(fetch(new URL('/models', running.capability.baseURL))).rejects.toThrow()
  })
})

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cliproxyapi-'))
  roots.push(root)
  return root
}

async function findConfig(stateRoot: string): Promise<string> {
  const { readdir } = await import('node:fs/promises')
  const [generation] = await readdir(stateRoot)
  if (generation === undefined) throw new Error('missing generation')
  return join(stateRoot, generation, 'config.yaml')
}

function fixtureSource(delayMs = 0): string {
  return `#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
const path = process.argv[process.argv.indexOf('--config') + 1]
const config = readFileSync(path, 'utf8')
const port = Number(config.match(/port: (\\d+)/)[1])
const key = config.match(/api-keys:\\n  - "([^"]+)"/)[1]
const server = createServer((request, response) => {
  if (request.url !== '/v1/models' || request.headers.authorization !== 'Bearer ' + key) { response.statusCode = 401; response.end(); return }
  response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: [] }))
})
setTimeout(() => server.listen(port, '127.0.0.1'), ${String(delayMs)})
process.on('SIGTERM', () => server.close(() => process.exit(0)))
`
}
