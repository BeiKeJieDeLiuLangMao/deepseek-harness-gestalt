/** Desktop-owned CLIProxyAPI process selection, isolated state, readiness, and teardown. */
import { createHash, randomBytes } from 'node:crypto'
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PROVIDER_ID = 'gestalt-account-pool'
const CLIPROXYAPI_SOURCE_SHA = '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974'
const READINESS_INTERVAL_MS = 50

/** Identity recorded beside one packaged CLIProxyAPI executable. */
export interface CLIProxyAPIResourceManifest {
  readonly sourceSHA: string
  readonly platform: NodeJS.Platform
  readonly arch: string
  readonly path: string
  readonly sha256: string
}

/** Stable internal inference authority passed only to the Web Host child. */
export interface CLIProxyAPIInferenceCapability {
  readonly provider: typeof PROVIDER_ID
  readonly baseURL: string
  readonly apiKey: string
}

/** One ready Desktop-owned core generation. */
export interface RunningCLIProxyAPI {
  readonly child: ChildProcess
  readonly capability: CLIProxyAPIInferenceCapability
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  stop(): Promise<void>
}

/** Supervisor construction facts. */
export interface CLIProxyAPISupervisorOptions {
  readonly binary: string
  readonly stateRoot: string
  readonly startupTimeoutMs: number
  readonly restartLimit: number
  readonly fetch?: typeof globalThis.fetch
  /** Test-only race injection after the reservation closes and before spawn. */
  readonly afterPortReservation?: (port: number) => void | Promise<void>
  /** Resolve OS listener owners; omission uses the supported platform inspector. */
  readonly listenerOwners?: (port: number) => Promise<ReadonlySet<number>>
}

/** Resolve and verify one packaged CLIProxyAPI resource. */
export async function verifyCLIProxyAPIResource(
  resourceDirectory: string,
  manifestPath = join(resourceDirectory, 'manifest.json'),
): Promise<string> {
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown)
  if (manifest.sourceSHA !== CLIPROXYAPI_SOURCE_SHA) {
    throw new Error(`CLIProxyAPI resource source is ${manifest.sourceSHA}, expected ${CLIPROXYAPI_SOURCE_SHA}`)
  }
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error(`CLIProxyAPI resource targets ${manifest.platform}/${manifest.arch}, not ${process.platform}/${process.arch}`)
  }
  const binary = resolve(resourceDirectory, manifest.path)
  const info = await stat(binary)
  if (!info.isFile()) throw new Error('CLIProxyAPI resource is not a file')
  const digest = createHash('sha256').update(await readFile(binary)).digest('hex')
  if (digest !== manifest.sha256) throw new Error('CLIProxyAPI resource SHA-256 does not match its manifest')
  return binary
}

/** Read a validated resource manifest without exposing executable bytes. */
export async function readCLIProxyAPIResourceManifest(path: string): Promise<CLIProxyAPIResourceManifest> {
  return parseManifest(JSON.parse(await readFile(path, 'utf8')) as unknown)
}

/** Owns one isolated core process and bounded replacement after unexpected exit. */
export class CLIProxyAPISupervisor {
  private readonly controller = new AbortController()
  private current: RunningCLIProxyAPI | undefined
  private pending: Promise<RunningCLIProxyAPI> | undefined
  private shutdownTask: Promise<void> | undefined
  private restartCount = 0

  /** @param options - Exact binary, isolated state root, and lifecycle bounds. */
  constructor(private readonly options: CLIProxyAPISupervisorOptions) {
    if (!Number.isSafeInteger(options.startupTimeoutMs) || options.startupTimeoutMs <= 0) {
      throw new TypeError('CLIProxyAPI startupTimeoutMs must be a positive safe integer')
    }
    if (!Number.isSafeInteger(options.restartLimit) || options.restartLimit < 0) {
      throw new TypeError('CLIProxyAPI restartLimit must be a non-negative safe integer')
    }
  }

  /** Start or join the current generation. */
  start(): Promise<RunningCLIProxyAPI> {
    if (this.shutdownTask !== undefined) return Promise.reject(new Error('CLIProxyAPI supervisor is closed'))
    if (this.current !== undefined) return Promise.resolve(this.current)
    if (this.pending !== undefined) return this.pending
    const task = this.spawnGeneration()
    this.pending = task
    void task.then((running) => {
      this.pending = undefined
      if (this.shutdownTask !== undefined) {
        void running.stop()
        return
      }
      this.current = running
      void running.exited.then(() => this.onExit(running))
    }, () => { this.pending = undefined })
    return task
  }

  /** Stop the exact current generation and start a replacement. */
  async restart(): Promise<RunningCLIProxyAPI> {
    const previous = this.current
    this.current = undefined
    if (previous !== undefined) await previous.stop()
    return await this.start()
  }

  /** Cancel startup/recovery, stop and join every admitted generation, and remove generated state. */
  shutdown(): Promise<void> {
    if (this.shutdownTask !== undefined) return this.shutdownTask
    this.controller.abort()
    const pending = this.pending
    const running = this.current
    this.current = undefined
    this.shutdownTask = Promise.resolve().then(async () => {
      const admitted = await pending?.catch(() => undefined)
      await Promise.all([running, admitted].flatMap(value => value === undefined ? [] : [value.stop()]))
      await rm(this.options.stateRoot, { recursive: true, force: true })
    })
    return this.shutdownTask
  }

  private async onExit(running: RunningCLIProxyAPI): Promise<void> {
    if (this.current !== running) return
    this.current = undefined
    if (this.shutdownTask !== undefined || this.restartCount >= this.options.restartLimit) return
    this.restartCount += 1
    await this.start().catch(() => undefined)
  }

  private async spawnGeneration(): Promise<RunningCLIProxyAPI> {
    if (this.controller.signal.aborted) throw new Error('CLIProxyAPI startup aborted')
    const port = await reserveLoopbackPort()
    await this.options.afterPortReservation?.(port)
    const generation = randomBytes(12).toString('hex')
    const root = join(this.options.stateRoot, generation)
    const authDir = join(root, 'auth')
    const logDir = join(root, 'logs')
    const configPath = join(root, 'config.yaml')
    await mkdir(authDir, { recursive: true, mode: 0o700 })
    await mkdir(logDir, { recursive: true, mode: 0o700 })
    const managementKey = randomBytes(32).toString('base64url')
    const inferenceKey = randomBytes(32).toString('base64url')
    await writeFile(configPath, coreConfig(port, authDir, logDir, managementKey, inferenceKey), { mode: 0o600 })
    await chmod(configPath, 0o600)
    const binary = resolve(this.options.binary)
    const child = spawn(binary, ['--config', configPath], {
      cwd: root,
      env: credentialSafeEnvironment(process.env),
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((onResolve, onReject) => {
      child.once('error', onReject)
      child.once('exit', (code, signal) => onResolve(Object.freeze({ code, signal })))
    })
    let stopTask: Promise<void> | undefined
    const stop = (): Promise<void> => stopTask ??= stopProcessTree(child, exited)
    try {
      await waitForReady({
        child, exited, stop, port, inferenceKey,
        listenerOwners: this.options.listenerOwners ?? listenerOwners,
        timeoutMs: this.options.startupTimeoutMs,
        signal: this.controller.signal,
        fetch: this.options.fetch ?? globalThis.fetch,
      })
    } catch (error) {
      await stop().catch(() => undefined)
      throw error
    }
    return {
      child,
      capability: Object.freeze({ provider: PROVIDER_ID, baseURL: `http://127.0.0.1:${String(port)}/v1`, apiKey: inferenceKey }),
      exited,
      stop,
    }
  }
}

function parseManifest(value: unknown): CLIProxyAPIResourceManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('CLIProxyAPI resource manifest must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.sourceSHA !== 'string' || !/^[0-9a-f]{40}$/u.test(record.sourceSHA)
    || typeof record.platform !== 'string' || typeof record.arch !== 'string'
    || typeof record.path !== 'string' || record.path.length === 0 || basename(record.path) !== record.path
    || typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
    throw new Error('CLIProxyAPI resource manifest is invalid')
  }
  return record as unknown as CLIProxyAPIResourceManifest
}

function coreConfig(port: number, authDir: string, logDir: string, managementKey: string, inferenceKey: string): string {
  return [
    'host: "127.0.0.1"',
    `port: ${String(port)}`,
    'tls:', '  enable: false',
    'remote-management:', '  allow-remote: false', `  secret-key: "${managementKey}"`, '  disable-control-panel: true',
    `auth-dir: ${JSON.stringify(authDir)}`,
    'api-keys:', `  - "${inferenceKey}"`,
    'debug: false', 'logging-to-file: true', `logs-dir: ${JSON.stringify(logDir)}`,
    'usage-statistics-enabled: false',
    '',
  ].join('\n')
}

function credentialSafeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
    : ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']
  return Object.fromEntries(allowed.flatMap(name => environment[name] === undefined ? [] : [[name, environment[name]]]))
}

async function reserveLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('CLIProxyAPI dynamic port reservation failed')))
        return
      }
      server.close(error => error === undefined ? resolve(address.port) : reject(error))
    })
  })
}

async function waitForReady(options: {
  child: ChildProcess
  exited: Promise<unknown>
  stop: () => Promise<void>
  port: number
  inferenceKey: string
  listenerOwners: (port: number) => Promise<ReadonlySet<number>>
  timeoutMs: number
  signal: AbortSignal
  fetch: typeof globalThis.fetch
}): Promise<void> {
  let failed = false
  void options.exited.then(() => { failed = true }, () => { failed = true })
  const deadline = Date.now() + options.timeoutMs
  while (Date.now() < deadline) {
    if (options.signal.aborted) throw new Error('CLIProxyAPI startup aborted')
    if (options.child.exitCode !== null || options.child.signalCode !== null) throw new Error('CLIProxyAPI exited before readiness')
    if (failed) throw new Error('CLIProxyAPI failed before readiness')
    const pid = options.child.pid
    if (pid === undefined) throw new Error('CLIProxyAPI child has no process id')
    const owners = await options.listenerOwners(options.port)
    if (!owners.has(pid)) {
      await new Promise(resolve => setTimeout(resolve, READINESS_INTERVAL_MS))
      continue
    }
    try {
      const response = await options.fetch(`http://127.0.0.1:${String(options.port)}/v1/models`, {
        headers: { Authorization: `Bearer ${options.inferenceKey}` }, signal: AbortSignal.timeout(500),
      })
      if (response.ok) return
    } catch {
      // Connection refusal and the per-attempt timeout mean the child has not committed readiness yet.
    }
    await new Promise(resolve => setTimeout(resolve, READINESS_INTERVAL_MS))
  }
  throw new Error(`CLIProxyAPI did not become ready within ${String(options.timeoutMs)}ms`)
}

async function listenerOwners(port: number): Promise<ReadonlySet<number>> {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-NetTCPConnection -State Listen -LocalPort ${String(port)} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess) -join '\n'`,
    ])
    return numericLines(stdout)
  }
  const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', '-t', `-iTCP:${String(port)}`, '-sTCP:LISTEN'])
    .catch((error: unknown) => {
      const code = (error as { code?: unknown }).code
      if (code === 1) return { stdout: '', stderr: '' }
      throw error
    })
  return numericLines(stdout)
}

function numericLines(output: string): ReadonlySet<number> {
  return new Set(output.split(/\s+/u).flatMap((value) => {
    const pid = Number(value)
    return Number.isSafeInteger(pid) && pid > 0 ? [pid] : []
  }))
}

async function stopProcessTree(
  child: ChildProcess,
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exited
    return
  }
  const pid = child.pid
  if (pid === undefined) throw new Error('CLIProxyAPI child has no process id')
  if (process.platform === 'win32') await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f'])
  else process.kill(-pid, 'SIGTERM')
  await exited
}
