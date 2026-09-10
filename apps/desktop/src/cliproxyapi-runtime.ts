/** Desktop-owned CLIProxyAPI process selection, isolated state, readiness, and teardown. */
import { createHash, randomBytes } from 'node:crypto'
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join, resolve } from 'node:path'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { promisify } from 'node:util'
import type { QuotaObservationTransport, QuotaProbeRequest, QuotaProbeResponse } from '@deepseek-ai/dsh-cliproxy-quota'

const execFileAsync = promisify(execFile)
const PROVIDER_ID = 'gestalt-account-pool'
const READINESS_INTERVAL_MS = 50
const MANAGEMENT_PROBE_TIMEOUT_MS = 15_000
const MANAGEMENT_MAX_BODY_BYTES = 1_048_576
const ALLOWED_CORE_PATHS = new Set([
  '/v0/management/auth-files',
  '/v0/management/auth-files/status',
  '/v0/management/anthropic-auth-url',
  '/v0/management/codex-auth-url',
  '/v0/management/antigravity-auth-url',
  '/v0/management/kimi-auth-url',
  '/v0/management/xai-auth-url',
  '/v0/management/get-auth-status',
  '/v0/management/oauth-session',
  '/v0/management/glm-coding-plan',
])

/** Identity recorded beside one packaged CLIProxyAPI executable. */
interface CLIProxyAPIResourceManifest {
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
  /** Generation-private self-signed certificate used as the TLS trust pin. */
  readonly caPath: string
}

/** One Host-private management HTTP request against the current generation. */
export interface CLIProxyAPICoreRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string
  readonly body?: string
}

/** One ready Desktop-owned core generation. */
export interface RunningCLIProxyAPI {
  readonly child: ChildProcess
  readonly capability: CLIProxyAPIInferenceCapability
  /** Host-private quota probe channel bound to this generation; never exported to renderer. */
  readonly management: QuotaObservationTransport
  /** Host-private management HTTP against this generation; never exported to renderer. */
  readonly coreRequest: (request: CLIProxyAPICoreRequest) => Promise<{ statusCode: number; body: string }>
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  stop(): Promise<void>
}

/** Supervisor construction facts. */
export interface CLIProxyAPISupervisorOptions {
  readonly binary: string
  readonly stateRoot: string
  readonly startupTimeoutMs: number
  readonly restartLimit: number
  /** Test-only argv inserted before `--config`. Windows Node fixtures pass the `.mjs` script here. */
  readonly binaryArgs?: readonly string[]
  /** Test-only race injection after the reservation closes and before spawn. */
  readonly afterPortReservation?: (port: number) => void | Promise<void>
  /** Test-only callback after the TLS handshake and before the authenticated request. */
  readonly afterTlsHandshake?: () => void | Promise<void>
  /** Grace period before an owned process tree receives forced termination. */
  readonly stopGraceMs?: number
  /** Publish each ready inference generation and its withdrawal. */
  readonly onCapability?: (capability: CLIProxyAPIInferenceCapability | undefined) => void | Promise<void>
  /** Publish the Host-private management transport for the current generation. */
  readonly onManagement?: (transport: QuotaObservationTransport | undefined) => void | Promise<void>
}

/** Resolve and verify one packaged CLIProxyAPI resource. */
export async function verifyCLIProxyAPIResource(
  resourceDirectory: string,
  expectedSourceSHA: string,
  manifestPath = join(resourceDirectory, 'manifest.json'),
): Promise<string> {
  if (!/^[0-9a-f]{40}$/u.test(expectedSourceSHA)) throw new Error('CLIProxyAPI expected source identity is invalid')
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown)
  if (manifest.sourceSHA !== expectedSourceSHA) {
    throw new Error(`CLIProxyAPI resource source is ${manifest.sourceSHA}, expected ${expectedSourceSHA}`)
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
    if (options.stopGraceMs !== undefined && (!Number.isSafeInteger(options.stopGraceMs) || options.stopGraceMs <= 0)) {
      throw new TypeError('CLIProxyAPI stopGraceMs must be a positive safe integer')
    }
  }

  private generationIsCurrent(child: ChildProcess): boolean {
    if (this.shutdownTask !== undefined) return false
    const live = this.current
    if (live !== undefined && live.child !== child) return false
    return child.exitCode === null && child.signalCode === null
  }

  /** Host-private management HTTP against the current generation. */
  coreRequest(request: CLIProxyAPICoreRequest): Promise<{ statusCode: number; body: string }> {
    const current = this.current
    if (current === undefined) return Promise.reject(new Error('CLIProxyAPI management generation is not current'))
    return current.coreRequest(request)
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
      void Promise.all([
        Promise.resolve(this.options.onCapability?.(running.capability)),
        Promise.resolve(this.options.onManagement?.(running.management)),
      ]).catch(() => running.stop())
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
      await Promise.all([
        this.options.onCapability?.(undefined),
        this.options.onManagement?.(undefined),
      ])
      const admitted = await pending?.catch(() => undefined)
      await Promise.all([running, admitted].flatMap(value => value === undefined ? [] : [value.stop()]))
      await rm(this.options.stateRoot, { recursive: true, force: true })
    })
    return this.shutdownTask
  }

  private async onExit(running: RunningCLIProxyAPI): Promise<void> {
    if (this.current !== running) return
    this.current = undefined
    try {
      await Promise.all([
        this.options.onCapability?.(undefined),
        this.options.onManagement?.(undefined),
      ])
    } catch {
      // Withdrawal failure cannot restore the exited core; recovery still owns the next generation.
    }
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
    await mkdir(join(root, 'tmp'), { recursive: true, mode: 0o700 })
    const managementKey = randomBytes(32).toString('base64url')
    const inferenceKey = randomBytes(32).toString('base64url')
    const certPath = join(root, 'tls.crt')
    const keyPath = join(root, 'tls.key')
    await writeGenerationCertificate(root, certPath, keyPath)
    await writeFile(configPath, coreConfig(port, authDir, logDir, managementKey, inferenceKey, certPath, keyPath), { mode: 0o600 })
    await chmod(configPath, 0o600)
    const binary = resolve(this.options.binary)
    const child = spawn(binary, [...this.options.binaryArgs ?? [], '--config', configPath], {
      cwd: root,
      env: credentialSafeEnvironment(process.env, root),
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((onResolve, onReject) => {
      child.once('error', onReject)
      child.once('exit', (code, signal) => { onResolve(Object.freeze({ code, signal })) })
    })
    let stopTask: Promise<void> | undefined
    const stop = (): Promise<void> => stopTask ??= stopProcessTree(child, exited, this.options.stopGraceMs ?? 2_000)
    try {
      await waitForReady({
        child, port, inferenceKey, certPath,
        ...this.options.afterTlsHandshake === undefined ? {} : { afterTlsHandshake: this.options.afterTlsHandshake },
        timeoutMs: this.options.startupTimeoutMs,
        signal: this.controller.signal,
      })
    } catch (error) {
      await stop().catch(() => undefined)
      throw error
    }
    const running: RunningCLIProxyAPI = {
      child,
      capability: Object.freeze({
        provider: PROVIDER_ID,
        baseURL: `https://127.0.0.1:${String(port)}/v1`,
        apiKey: inferenceKey,
        caPath: certPath,
      }),
      management: Object.freeze({
        request: async (request: QuotaProbeRequest): Promise<QuotaProbeResponse> => {
          if (!this.generationIsCurrent(child)) {
            return { statusCode: 0, error: 'CLIProxyAPI management generation is not current' }
          }
          const authIndex = request.authIndex.trim()
          if (authIndex.length === 0) return { statusCode: 0, error: 'empty account reference' }
          try {
            return await requestManagementApiCall({
              port, certPath, managementKey, request, signal: this.controller.signal,
            })
          } catch (error) {
            return { statusCode: 0, error: error instanceof Error ? error.message : 'CLIProxyAPI management request failed' }
          }
        },
      }),
      coreRequest: async (request: CLIProxyAPICoreRequest): Promise<{ statusCode: number; body: string }> => {
        if (!this.generationIsCurrent(child)) {
          throw new Error('CLIProxyAPI management generation is not current')
        }
        const pathname = request.path.split('?')[0] ?? request.path
        if (!ALLOWED_CORE_PATHS.has(pathname)) {
          throw new Error('CLIProxyAPI management path is not a Host product operation')
        }
        const ca = await readFile(certPath)
        return await requestPinnedHttps({
          port,
          path: request.path,
          method: request.method,
          ca,
          authorization: `Bearer ${managementKey}`,
          ...request.body === undefined ? {} : { body: request.body },
          signal: this.controller.signal,
        })
      },
      exited,
      stop,
    }
    this.current = running
    return running
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

function coreConfig(
  port: number,
  authDir: string,
  logDir: string,
  managementKey: string,
  inferenceKey: string,
  certPath: string,
  keyPath: string,
): string {
  return [
    'host: "127.0.0.1"',
    `port: ${String(port)}`,
    'tls:', '  enable: true', `  cert: ${JSON.stringify(certPath)}`, `  key: ${JSON.stringify(keyPath)}`,
    'remote-management:', '  allow-remote: false', `  secret-key: "${managementKey}"`, '  disable-control-panel: true',
    `auth-dir: ${JSON.stringify(authDir)}`,
    'api-keys:', `  - "${inferenceKey}"`,
    'debug: false', 'logging-to-file: true', `logs-dir: ${JSON.stringify(logDir)}`,
    'usage-statistics-enabled: false',
    '',
  ].join('\n')
}

async function requestManagementApiCall(options: {
  port: number
  certPath: string
  managementKey: string
  request: QuotaProbeRequest
  signal: AbortSignal
}): Promise<QuotaProbeResponse> {
  if (options.signal.aborted) return { statusCode: 0, error: 'CLIProxyAPI startup aborted' }
  const ca = await readFile(options.certPath)
  const body = JSON.stringify({
    auth_index: options.request.authIndex,
    method: options.request.method,
    url: options.request.url,
    header: options.request.headers,
    ...options.request.body === undefined ? {} : { data: options.request.body },
  })
  const text = await requestPinnedHttps({
    port: options.port,
    path: '/v0/management/api-call',
    method: 'POST',
    ca,
    authorization: `Bearer ${options.managementKey}`,
    body,
    signal: options.signal,
  })
  if (Buffer.byteLength(text.body, 'utf8') > MANAGEMENT_MAX_BODY_BYTES) {
    return { statusCode: 0, error: 'CLIProxyAPI management response exceeded the bounded body limit' }
  }
  if (text.statusCode < 200 || text.statusCode >= 300) {
    return { statusCode: 0, error: `CLIProxyAPI management answered status ${String(text.statusCode)}` }
  }
  let payload: unknown
  try {
    payload = JSON.parse(text.body) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) return { statusCode: 0, error: 'CLIProxyAPI management response was not parseable JSON' }
    throw error
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { statusCode: 0, error: 'CLIProxyAPI management response was not parseable JSON' }
  }
  const record = payload as Record<string, unknown>
  const statusCode = typeof record.status_code === 'number' ? record.status_code : 0
  const upstream = typeof record.body === 'string' ? record.body : undefined
  return { statusCode, ...(upstream === undefined ? {} : { bodyText: upstream }) }
}

function requestPinnedHttps(options: {
  port: number
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  ca: Buffer
  authorization: string
  body?: string
  signal: AbortSignal
}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = options.body
    const request = httpsRequest({
      host: '127.0.0.1',
      port: options.port,
      path: options.path,
      method: options.method,
      ca: options.ca,
      servername: 'localhost',
      headers: {
        Authorization: options.authorization,
        ...(body === undefined ? {} : {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        }),
      },
      timeout: MANAGEMENT_PROBE_TIMEOUT_MS,
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk as Buffer))
      response.on('end', () => {
        resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    const abort = (): void => {
      request.destroy(new Error('CLIProxyAPI startup aborted'))
    }
    options.signal.addEventListener('abort', abort, { once: true })
    request.once('error', (error) => {
      options.signal.removeEventListener('abort', abort)
      reject(error)
    })
    request.once('timeout', () => {
      request.destroy(new Error('CLIProxyAPI management request timed out'))
    })
    request.once('close', () => { options.signal.removeEventListener('abort', abort) })
    if (options.signal.aborted) abort()
    else request.end(body)
  })
}

async function writeGenerationCertificate(root: string, certPath: string, keyPath: string): Promise<void> {
  await execFileAsync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ], { cwd: root })
  await chmod(certPath, 0o600)
  await chmod(keyPath, 0o600)
}

function credentialSafeEnvironment(environment: NodeJS.ProcessEnv, privateHome: string): NodeJS.ProcessEnv {
  const allowed = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']
    : ['PATH', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']
  const retained = Object.fromEntries(allowed.flatMap(name => environment[name] === undefined ? [] : [[name, environment[name]]]))
  return process.platform === 'win32'
    ? { ...retained, USERPROFILE: privateHome, HOME: privateHome, TEMP: join(privateHome, 'tmp'), TMP: join(privateHome, 'tmp') }
    : { ...retained, HOME: privateHome, TMPDIR: join(privateHome, 'tmp') }
}

async function reserveLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => { reject(new Error('CLIProxyAPI dynamic port reservation failed')) })
        return
      }
      server.close((error) => {
        if (error === undefined) resolve(address.port)
        else reject(error)
      })
    })
  })
}

async function waitForReady(options: {
  child: ChildProcess
  port: number
  inferenceKey: string
  certPath: string
  afterTlsHandshake?: () => void | Promise<void>
  timeoutMs: number
  signal: AbortSignal
}): Promise<void> {
  const deadline = Date.now() + options.timeoutMs
  const ca = await readFile(options.certPath)
  while (Date.now() < deadline) {
    if (options.signal.aborted) throw new Error('CLIProxyAPI startup aborted')
    if (options.child.exitCode !== null || options.child.signalCode !== null) throw new Error('CLIProxyAPI exited before readiness')
    if (options.child.pid === undefined) throw new Error('CLIProxyAPI child has no process id')
    try {
      if (await pinnedAuthenticatedProbe({
        port: options.port,
        inferenceKey: options.inferenceKey,
        ca,
        child: options.child,
        signal: options.signal,
        ...options.afterTlsHandshake === undefined ? {} : { afterTlsHandshake: options.afterTlsHandshake },
      })) return
    } catch (error) {
      if (error instanceof Error && /exited before readiness|startup aborted/u.test(error.message)) throw error
      // Connection refusal, TLS mismatch, and per-attempt timeout are not readiness.
    }
    await new Promise(resolve => setTimeout(resolve, READINESS_INTERVAL_MS))
  }
  throw new Error(`CLIProxyAPI did not become ready within ${String(options.timeoutMs)}ms`)
}

async function pinnedAuthenticatedProbe(options: {
  port: number
  inferenceKey: string
  ca: Buffer
  child: ChildProcess
  signal: AbortSignal
  afterTlsHandshake?: () => void | Promise<void>
}): Promise<boolean> {
  const socket = await connectPinnedTls(options.port, options.ca, options.signal)
  try {
    await options.afterTlsHandshake?.()
    if (options.signal.aborted) throw new Error('CLIProxyAPI startup aborted')
    if (options.child.exitCode !== null || options.child.signalCode !== null) throw new Error('CLIProxyAPI exited before readiness')
    const response = await requestModelsOnTls(socket, options.inferenceKey, options.signal)
    return response.startsWith('HTTP/1.1 200 ') || response.startsWith('HTTP/1.0 200 ')
  } finally {
    socket.destroy()
  }
}

function connectPinnedTls(port: number, ca: Buffer, signal: AbortSignal): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: '127.0.0.1',
      port,
      ca,
      servername: 'localhost',
      ALPNProtocols: ['http/1.1'],
      minVersion: 'TLSv1.2',
    })
    const timer = setTimeout(() => { settle(new Error('CLIProxyAPI TLS handshake timed out')) }, 500)
    const abort = (): void => { settle(new Error('CLIProxyAPI startup aborted')) }
    const error = (cause: Error): void => { settle(cause) }
    const secure = (): void => {
      if (!socket.authorized) settle(new Error('CLIProxyAPI TLS certificate is not the generation pin'))
      else settle(undefined, socket)
    }
    let settled = false
    const settle = (failure?: Error, value?: TLSSocket): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      socket.removeListener('error', error)
      socket.removeListener('secureConnect', secure)
      if (failure !== undefined) {
        socket.destroy()
        reject(failure)
      } else if (value !== undefined) resolve(value)
    }
    signal.addEventListener('abort', abort, { once: true })
    socket.once('error', error)
    socket.once('secureConnect', secure)
    if (signal.aborted) abort()
  })
}

function requestModelsOnTls(socket: TLSSocket, inferenceKey: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    let response = ''
    const timer = setTimeout(() => { settle(new Error('CLIProxyAPI readiness response timed out')) }, 500)
    const abort = (): void => { settle(new Error('CLIProxyAPI startup aborted')) }
    const data = (chunk: Buffer): void => {
      response += chunk.toString()
      if (response.includes('\r\n\r\n')) settle(undefined, response)
    }
    const error = (cause: Error): void => { settle(cause) }
    const close = (): void => { settle(new Error('CLIProxyAPI readiness socket closed')) }
    let settled = false
    const settle = (failure?: Error, value?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      socket.removeListener('data', data)
      socket.removeListener('error', error)
      socket.removeListener('close', close)
      if (failure !== undefined) reject(failure)
      else resolve(value ?? '')
    }
    signal.addEventListener('abort', abort, { once: true })
    socket.on('data', data)
    socket.once('error', error)
    socket.once('close', close)
    if (signal.aborted) {
      abort()
      return
    }
    socket.write([
      'GET /v1/models HTTP/1.1',
      'Host: localhost',
      `Authorization: Bearer ${inferenceKey}`,
      'Connection: close',
      '', '',
    ].join('\r\n'))
  })
}

async function stopProcessTree(
  child: ChildProcess,
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
  graceMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exited
    return
  }
  const pid = child.pid
  if (pid === undefined) throw new Error('CLIProxyAPI child has no process id')
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(pid), '/t'])
    if (!await settlesWithin(exited, graceMs)) await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f'])
  } else {
    process.kill(-pid, 'SIGTERM')
    if (!await settlesWithin(exited, graceMs)) process.kill(-pid, 'SIGKILL')
  }
  await exited
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => { resolve(false) }, timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
