/** Managed Tandem Browser HTTP Service Provider for the Browser Runtime capability. @module @deepseek-ai/dsh-browser-runtime-tandem */

import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserRuntime,
  BrowserRuntimeError,
  BrowserTabId,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'
import type {
  BrowserClosedState,
  BrowserCreateRequest,
  BrowserMutationRequest,
  BrowserNavigateRequest,
  BrowserObserveRequest,
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-runtime'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import {
  registerTandemRuntimeStateReader,
  TANDEM_RUNTIME_STATE_OWNER,
  tandemRuntimeStateValidator,
  type TandemRuntimeStateOwner,
} from './runtime-state.ts'

/** Pinned Tandem Browser source revision whose HTTP protocol this Provider implements. */
export const TANDEM_UPSTREAM_REVISION = '3b613cfd4c299609ca7ca415d638c1b71c6ba5de'
/** Tandem Browser version reported by the pinned source revision. */
export const TANDEM_UPSTREAM_VERSION = '1.11.4'

const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Process, HTTP, and lifecycle configuration for one managed Tandem runtime. */
export interface Config {
  /** Executable used to launch the pinned Tandem Browser checkout or package. */
  command: string
  /** Arguments passed without shell interpretation. */
  args?: string[]
  /** Existing directory used as the Tandem child process working directory. */
  cwd: string
  /** Explicit environment layered over the subprocess service's credential-scrubbed parent environment. */
  env?: Record<string, string>
  /** Loopback Tandem HTTP API origin, including its configured port. */
  baseUrl: string
  /** Local file where Tandem writes its generated API token. */
  tokenFile: string
  /** Prefix for DSH-owned opaque Profile, Workspace, and browser identities. */
  idPrefix?: string
  /** Bound on child startup and Tandem health verification. */
  startupTimeoutMs?: number
  /** Bound on each Tandem HTTP operation. */
  requestTimeoutMs?: number
  /** Delay between startup health probes. */
  healthPollMs?: number
  /** Upper bound on upstream page-settle waiting for one content read. */
  pageSettleMs?: number
  /** Number of child restarts after an unexpected exit. */
  reconnectAttempts?: number
  /** Delay before each reconnect attempt. */
  reconnectDelayMs?: number
  /** Subprocess tree SIGTERM-to-SIGKILL grace used for teardown. */
  processGraceMs?: number
  /** Maximum bytes accepted from one Tandem HTTP response. */
  maxResponseBytes?: number
}

/** Runtime configuration schema for the managed Tandem Browser Provider. */
export const Config: z<Config> = z.object({
  command: z.string().required(),
  args: z.array(z.string()).default([]),
  cwd: z.string().required(),
  env: z.dict(z.string()).default({}),
  baseUrl: z.string().required(),
  tokenFile: z.string().required(),
  idPrefix: z.string().default('tandem'),
  startupTimeoutMs: z.number().default(60_000),
  requestTimeoutMs: z.number().default(30_000),
  healthPollMs: z.number().default(250),
  pageSettleMs: z.number().default(250),
  reconnectAttempts: z.number().default(2),
  reconnectDelayMs: z.number().default(500),
  processGraceMs: z.number().default(5_000),
  maxResponseBytes: z.number().default(10_000_000),
})

type ResolvedConfig = Required<Config>

/** Fields the pinned Tandem tab inventory always carries; `title` and `url` may be empty while a page settles. */
interface TandemTab {
  readonly id: string
  readonly url: string
  readonly title: string
}

interface TandemPageContent {
  readonly title: string
  readonly url: string
  readonly text: string
}

/** Reject an invalid deployment-varying duration before spawning a child. */
function assertDuration(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`browser-runtime-tandem: ${name} must be a positive safe integer no greater than ${String(MAX_TIMER_DELAY_MS)}`)
  }
}

/** Reject a value outside the non-negative integer retry vocabulary. */
function assertRetries(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('browser-runtime-tandem: reconnectAttempts must be a non-negative safe integer')
  }
}

/** Reject an invalid response-size bound before spawning a child. */
function assertByteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('browser-runtime-tandem: maxResponseBytes must be a positive safe integer')
  }
}

/** Parse and constrain the bearer-token API origin to the local machine. */
function resolveBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('browser-runtime-tandem: baseUrl must be an absolute loopback HTTP origin')
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
  if (url.protocol !== 'http:' || !loopback || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('browser-runtime-tandem: baseUrl must be an absolute loopback HTTP origin')
  }
  return url.origin
}

/** Reject empty strings that Schemastery's required marker still admits. */
function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`browser-runtime-tandem: ${name} must be non-empty`)
}

/** Freeze one DSH-owned target around Tandem's opaque tab id. */
function targetFor(prefix: string, tandemTabId: string): BrowserTarget {
  return Object.freeze({
    profileId: BrowserProfileId(`${prefix}-profile`),
    workspaceId: BrowserWorkspaceId(`${prefix}-workspace`),
    browserId: BrowserInstanceId(`${prefix}-browser`),
    tabId: BrowserTabId(tandemTabId),
  })
}

/** Compare all four opaque identities without exposing Provider structure to callers. */
function sameTarget(left: BrowserTarget, right: BrowserTarget): boolean {
  return left.profileId === right.profileId
    && left.workspaceId === right.workspaceId
    && left.browserId === right.browserId
    && left.tabId === right.tabId
}

/** Reject already-aborted work before it reaches process or HTTP state. */
function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new BrowserRuntimeError(`browser operation aborted: ${String(signal.reason)}`, 'BROWSER_ABORTED')
  }
}

/** Narrow one untrusted JSON value to an object record. */
function objectValue(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserRuntimeError(`Tandem ${subject} response must be an object`, 'BROWSER_PROTOCOL')
  }
  return value as Record<string, unknown>
}

/** Read one required string field from an untrusted Tandem response. */
function stringField(value: Record<string, unknown>, key: string, subject: string): string {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) {
    throw new BrowserRuntimeError(`Tandem ${subject} response field ${key} must be a non-empty string`, 'BROWSER_PROTOCOL')
  }
  return field
}

/** Read one required string field that the pinned protocol admits as empty. */
function textField(value: Record<string, unknown>, key: string, subject: string): string {
  const field = value[key]
  if (typeof field !== 'string') {
    throw new BrowserRuntimeError(`Tandem ${subject} response field ${key} must be a string`, 'BROWSER_PROTOCOL')
  }
  return field
}

/** Parse one tab returned by Tandem's pinned tab protocol. */
function tandemTab(value: unknown, subject: string): TandemTab {
  const tab = objectValue(value, subject)
  return Object.freeze({
    id: stringField(tab, 'id', subject),
    url: textField(tab, 'url', subject),
    title: textField(tab, 'title', subject),
  })
}

/** Managed one-shot Tandem Browser Runtime for one temporary Profile and tab. */
export class TandemBrowserRuntime extends BrowserRuntime {
  static Config = Config
  static inject = ['subprocess']

  /** Package-private identity for this concrete Provider generation. */
  readonly [TANDEM_RUNTIME_STATE_OWNER]: TandemRuntimeStateOwner = Object.freeze({})

  private readonly config: ResolvedConfig
  private readonly baseUrl: string
  private readonly sessionName: string
  private state: BrowserRuntimeState | undefined
  private process: SubprocessHandle | undefined
  private tandemTabId: string | undefined
  private readonly intentionalStops = new WeakSet<SubprocessHandle>()
  private queue: Promise<void> = Promise.resolve()
  private recoveryScheduled = false
  private closing = false
  private disposed = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const resolved = config as ResolvedConfig
    assertNonEmpty('command', resolved.command)
    assertNonEmpty('cwd', resolved.cwd)
    assertNonEmpty('tokenFile', resolved.tokenFile)
    assertNonEmpty('idPrefix', resolved.idPrefix)
    assertDuration('startupTimeoutMs', resolved.startupTimeoutMs)
    assertDuration('requestTimeoutMs', resolved.requestTimeoutMs)
    assertDuration('healthPollMs', resolved.healthPollMs)
    assertDuration('pageSettleMs', resolved.pageSettleMs)
    assertDuration('reconnectDelayMs', resolved.reconnectDelayMs)
    assertDuration('processGraceMs', resolved.processGraceMs)
    assertByteLimit(resolved.maxResponseBytes)
    assertRetries(resolved.reconnectAttempts)
    this.config = resolved
    this.baseUrl = resolveBaseUrl(resolved.baseUrl)
    this.sessionName = `${resolved.idPrefix}-temporary`
    ctx.effect(
      () => registerTandemRuntimeStateReader(this[TANDEM_RUNTIME_STATE_OWNER], () => this.state),
      'Tandem Browser Runtime state reader',
    )
    ctx.effect(() => () => this.teardown(), 'Tandem Browser Runtime teardown')
  }

  /** Reject new work after Provider teardown begins. */
  private assertAccepting(): void {
    if (this.closing || this.disposed) {
      throw new BrowserRuntimeError('browser runtime is disposed', 'BROWSER_DISPOSED')
    }
  }

  /** Serialize one accepted operation behind all earlier reads and mutations. */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.assertAccepting()
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  /** Emit one committed state while containing broken ordinary observers. */
  private notifyState(state: BrowserRuntimeState): void {
    const args = ['browser/runtime-state', state]
    for (const listener of this.ctx.events.dispatch('emit', args) as Array<(value: BrowserRuntimeState) => unknown>) {
      try {
        const returned = listener(state)
        if (returned != null && typeof (returned as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(returned as PromiseLike<unknown>).then(undefined, (error: unknown) => {
            this.ctx.logger.warn('browser-runtime-tandem: a browser/runtime-state observer failed')
            this.ctx.logger.warn(error)
          })
        }
      } catch (error) {
        this.ctx.logger.warn('browser-runtime-tandem: a browser/runtime-state observer failed')
        this.ctx.logger.warn(error)
      }
    }
  }

  /** Commit and publish one immutable Provider state. */
  private commit<T extends BrowserRuntimeState>(state: T): T {
    const committed = Object.freeze(state) as T
    tandemRuntimeStateValidator(this[TANDEM_RUNTIME_STATE_OWNER])?.(committed)
    this.state = committed
    this.notifyState(committed)
    return committed
  }

  /** Resolve the addressed Provider state. */
  private addressed(target: BrowserTarget): BrowserRuntimeState {
    if (this.state === undefined || !sameTarget(this.state.target, target)) {
      throw new BrowserRuntimeError('browser target is not present', 'BROWSER_NOT_FOUND')
    }
    return this.state
  }

  /** Resolve an open page or reject its terminal close receipt. */
  private open(target: BrowserTarget): BrowserPageState {
    const state = this.addressed(target)
    if (state.status === 'unavailable') {
      throw new BrowserRuntimeError('Tandem browser runtime is unavailable', 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    if (state.status !== 'open') throw new BrowserRuntimeError('browser target is closed', 'BROWSER_NOT_OPEN')
    return state
  }

  /** Resolve the current Tandem-owned tab identity for the stable DSH target. */
  private upstreamTabId(): string {
    if (this.tandemTabId === undefined) {
      throw new BrowserRuntimeError('Tandem no longer reports the addressed tab', 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    return this.tandemTabId
  }

  /** Enforce optimistic ordering for Agent and human mutations. */
  private expected(state: BrowserRuntimeState, revision: number): void {
    if (state.revision !== revision) {
      throw new BrowserRuntimeError(
        `browser revision conflict: expected ${String(revision)}, current ${String(state.revision)}`,
        'BROWSER_REVISION_CONFLICT',
      )
    }
  }

  /** Read the current Tandem bearer token after startup generated it. */
  private async token(): Promise<string> {
    let token: string
    try {
      token = (await readFile(this.config.tokenFile, 'utf8')).trim()
    } catch (error) {
      throw new BrowserRuntimeError(`Tandem API token is unavailable: ${String(error)}`, 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    if (token.length < 32) {
      throw new BrowserRuntimeError('Tandem API token must contain at least 32 characters', 'BROWSER_PROTOCOL')
    }
    return token
  }

  /** Read a bounded response body before decoding protocol data. */
  private async responseBytes(response: Response): Promise<Uint8Array> {
    const declared = response.headers.get('content-length')
    if (declared !== null && Number(declared) > this.config.maxResponseBytes) {
      throw new BrowserRuntimeError('Tandem HTTP response exceeds maxResponseBytes', 'BROWSER_PROTOCOL')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > this.config.maxResponseBytes) {
      throw new BrowserRuntimeError('Tandem HTTP response exceeds maxResponseBytes', 'BROWSER_PROTOCOL')
    }
    return bytes
  }

  /** Execute one bounded Tandem HTTP request and retain its status-independent bytes. */
  private async request(
    path: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | undefined,
    authenticated = true,
  ): Promise<{ response: Response; bytes: Uint8Array }> {
    assertNotAborted(signal)
    const deadline = AbortSignal.timeout(this.config.requestTimeoutMs)
    const combined = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
    const headers = new Headers(init.headers)
    if (authenticated) headers.set('authorization', `Bearer ${await this.token()}`)
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: combined })
    } catch (error) {
      if (signal?.aborted) assertNotAborted(signal)
      throw new BrowserRuntimeError(`Tandem HTTP request failed: ${String(error)}`, 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    const bytes = await this.responseBytes(response)
    if (!response.ok) {
      const detail = Buffer.from(bytes).toString('utf8').slice(0, 1_000)
      throw new BrowserRuntimeError(`Tandem HTTP ${String(response.status)} for ${path}: ${detail}`, 'BROWSER_PROTOCOL')
    }
    return { response, bytes }
  }

  /** Decode one JSON response from the pinned Tandem protocol. */
  private async json(
    path: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | undefined,
    authenticated = true,
  ): Promise<unknown> {
    const { bytes } = await this.request(path, init, signal, authenticated)
    try {
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
    } catch {
      throw new BrowserRuntimeError(`Tandem ${path} response must be valid JSON`, 'BROWSER_PROTOCOL')
    }
  }

  /** Wait for the child API and verify the pinned Tandem product and version. */
  private async waitForHealth(signal: AbortSignal | undefined): Promise<void> {
    const deadline = Date.now() + this.config.startupTimeoutMs
    let lastError: unknown
    while (Date.now() < deadline) {
      assertNotAborted(signal)
      if (this.process === undefined) {
        throw new BrowserRuntimeError('Tandem child exited before startup health completed', 'BROWSER_RUNTIME_UNAVAILABLE')
      }
      try {
        const remaining = Math.max(1, deadline - Date.now())
        const startupSignal = AbortSignal.timeout(remaining)
        const probeSignal = signal === undefined ? startupSignal : AbortSignal.any([signal, startupSignal])
        const version = objectValue(await this.json('/agent/version', { method: 'GET' }, probeSignal, false), 'version')
        if (stringField(version, 'name', 'version') !== 'tandem-browser'
          || stringField(version, 'version', 'version') !== TANDEM_UPSTREAM_VERSION) {
          throw new BrowserRuntimeError(
            `Tandem runtime must report tandem-browser ${TANDEM_UPSTREAM_VERSION}`,
            'BROWSER_PROTOCOL',
          )
        }
        const status = objectValue(await this.json('/status', { method: 'GET' }, probeSignal, false), 'status')
        if (typeof status.ready !== 'boolean') {
          throw new BrowserRuntimeError('Tandem status response field ready must be boolean', 'BROWSER_PROTOCOL')
        }
        if (status.ready) return
      } catch (error) {
        // A caller abort propagates; an expired probe deadline is one more
        // failed sample that the startup bound below reports truthfully.
        if (signal?.aborted) assertNotAborted(signal)
        if (error instanceof BrowserRuntimeError && error.code === 'BROWSER_PROTOCOL') throw error
        lastError = error
      }
      await this.delay(this.config.healthPollMs, signal)
    }
    throw new BrowserRuntimeError(`Tandem startup health timed out: ${String(lastError)}`, 'BROWSER_RUNTIME_UNAVAILABLE')
  }

  /** Spawn one credential-scrubbed Tandem process tree and wait for its pinned API. */
  private async startProcess(signal: AbortSignal | undefined): Promise<void> {
    const executable = await this.ctx.subprocess.resolveExecutable(this.config.command, this.config.env, signal)
    assertNotAborted(signal)
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, ...this.config.args],
      cwd: this.config.cwd,
      env: this.config.env,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 64_000 },
        stderr: { maxBytes: 64_000 },
      },
      graceMs: this.config.processGraceMs,
    })
    this.process = handle
    void handle.done.then(
      (outcome) => { this.processExited(handle, `exit ${String(outcome.exitCode)} signal ${String(outcome.signal)}`) },
      (error: unknown) => { this.processExited(handle, `spawn failure ${String(error)}`) },
    )
    try {
      await this.waitForHealth(signal)
    } catch (error) {
      await this.stopProcess(handle)
      throw error
    }
  }

  /** Terminate and join one exact Tandem child process tree. */
  private async stopProcess(handle = this.process): Promise<void> {
    if (handle === undefined) return
    this.intentionalStops.add(handle)
    if (this.process === handle) this.process = undefined
    handle.terminate()
    // A spawn-level failure rejects `done`; that failure is already reported
    // through processExited, so the join only awaits quiescence here.
    await handle.done.then(() => undefined, () => undefined)
  }

  /** Resolve after a configured delay or reject promptly when the caller cancels. */
  private delay(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
    assertNotAborted(signal)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, milliseconds)
      const onAbort = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(new BrowserRuntimeError(`browser operation aborted: ${String(signal?.reason)}`, 'BROWSER_ABORTED'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Schedule one serialized reconnect after an unexpected child exit. */
  private processExited(handle: SubprocessHandle, detail: string): void {
    if (this.intentionalStops.has(handle) || this.process !== handle) return
    this.process = undefined
    if (this.closing || this.disposed || this.state?.status !== 'open') return
    this.ctx.logger.warn(`browser-runtime-tandem: managed child exited unexpectedly (${detail})`)
    this.scheduleRecovery('crashed', false)
  }

  /** Project availability loss and append one recovery transaction behind admitted work. */
  private scheduleRecovery(
    reason: 'crashed' | 'unhealthy',
    projectNow: boolean,
  ): BrowserRuntimeState | undefined {
    if (this.recoveryScheduled || this.state?.status === 'closed') return this.state
    const lastOpen = this.state?.status === 'open' ? this.state : undefined
    if (lastOpen === undefined) return this.state
    this.recoveryScheduled = true
    const projected = projectNow
      ? this.commit({
        status: 'unavailable' as const,
        target: lastOpen.target,
        revision: lastOpen.revision + 1,
        reason,
        reconnecting: this.config.reconnectAttempts > 0,
      })
      : undefined
    const recovery = this.queue.then(async () => {
      if (this.closing || this.disposed || this.state?.status === 'closed') return
      const unavailable = projected ?? this.commit({
        status: 'unavailable' as const,
        target: lastOpen.target,
        revision: lastOpen.revision + 1,
        reason,
        reconnecting: this.config.reconnectAttempts > 0,
      })
      await this.reconnect(lastOpen, unavailable)
    })
    this.queue = recovery.then(() => undefined, () => undefined)
    void recovery.finally(() => { this.recoveryScheduled = false }).catch((error: unknown) => {
      this.ctx.logger.warn('browser-runtime-tandem: reconnect transaction failed')
      this.ctx.logger.warn(error)
    })
    return projected
  }

  /** Restart Tandem a bounded number of times and restore the last real page. */
  private async reconnect(
    lastOpen: BrowserPageState,
    unavailable: Extract<BrowserRuntimeState, { status: 'unavailable' }>,
  ): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < this.config.reconnectAttempts; attempt += 1) {
      if (this.closing || this.disposed) return
      try {
        await this.stopProcess()
        await this.delay(this.config.reconnectDelayMs, undefined)
        await this.startProcess(undefined)
        const tab = await this.createSession(undefined, lastOpen.url)
        this.tandemTabId = tab.id
        const restored = await this.page(lastOpen, undefined)
        this.commit({ ...restored, revision: unavailable.revision + 1, focused: false })
        return
      } catch (error) {
        lastError = error
        await this.stopProcess()
      }
    }
    if (this.config.reconnectAttempts === 0) {
      // No restart will be attempted; an unavailable projection must never
      // leave a live browser child behind.
      await this.stopProcess()
    }
    if (this.config.reconnectAttempts > 0 && !this.closing && !this.disposed && this.state?.status === 'unavailable') {
      this.ctx.logger.warn('browser-runtime-tandem: reconnect attempts exhausted')
      this.ctx.logger.warn(lastError)
      this.commit({
        ...this.state,
        revision: this.state.revision + 1,
        reason: 'reconnect-failed',
        reconnecting: false,
      })
    }
  }

  /** Parse Tandem's session-create receipt and return its actual tab. */
  private async createSession(signal: AbortSignal | undefined, url = 'about:blank'): Promise<TandemTab> {
    const response = objectValue(await this.json('/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: this.sessionName, url }),
    }, signal), 'session create')
    return tandemTab(response.tab, 'session create tab')
  }

  /** Return the addressed tab from Tandem's global tab inventory. */
  private async readTab(tabId: string, signal: AbortSignal | undefined): Promise<TandemTab> {
    const response = objectValue(await this.json('/tabs/list', { method: 'GET' }, signal), 'tabs list')
    if (!Array.isArray(response.tabs)) {
      throw new BrowserRuntimeError('Tandem tabs list response field tabs must be an array', 'BROWSER_PROTOCOL')
    }
    const tabs = response.tabs.map(value => tandemTab(value, 'tabs list tab'))
    const tab = tabs.find(value => value.id === tabId)
    if (tab === undefined) throw new BrowserRuntimeError('Tandem no longer reports the addressed tab', 'BROWSER_RUNTIME_UNAVAILABLE')
    return tab
  }

  /**
   * Read model-visible page content for one exact Tandem tab. The pinned
   * upstream route waits its internal 10s maxWait whenever a page offers
   * fewer than 1000 text characters, so the request carries provider-owned
   * settle bounds and a minimal length target instead of inheriting them.
   */
  private async readContent(tabId: string, signal: AbortSignal | undefined): Promise<TandemPageContent> {
    const query = `?settleMs=${String(this.config.pageSettleMs)}&timeout=${String(this.config.requestTimeoutMs)}&minLength=1`
    const content = objectValue(await this.json(`/page-content${query}`, {
      method: 'GET',
      headers: { 'x-tab-id': tabId },
    }, signal), 'page content')
    return Object.freeze({
      title: textField(content, 'title', 'page content'),
      url: stringField(content, 'url', 'page content'),
      text: textField(content, 'text', 'page content'),
    })
  }

  /** Re-read one open page without advancing its DSH revision. */
  private async page(state: BrowserPageState, signal: AbortSignal | undefined): Promise<BrowserPageState> {
    const tab = await this.readTab(this.upstreamTabId(), signal)
    const content = await this.readContent(tab.id, signal)
    return Object.freeze({ ...state, url: content.url, title: content.title, text: content.text })
  }

  async create(request: BrowserCreateRequest): Promise<BrowserPageState> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      if (this.state !== undefined) {
        throw new BrowserRuntimeError('the Tandem browser runtime has already created its temporary Profile', 'BROWSER_CAPACITY')
      }
      await this.startProcess(request.signal)
      try {
        const tab = await this.createSession(request.signal)
        this.tandemTabId = tab.id
        return this.commit({
          status: 'open',
          target: targetFor(this.config.idPrefix, `${this.config.idPrefix}-tab`),
          revision: 0,
          url: tab.url,
          title: tab.title,
          text: '',
          focused: false,
        })
      } catch (error) {
        await this.stopProcess()
        throw error
      }
    })
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserPageState> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      await this.json('/navigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session': this.sessionName },
        body: JSON.stringify({ url: request.url, tabId: this.upstreamTabId() }),
      }, request.signal)
      const page = await this.page(state, request.signal)
      return this.commit({ ...page, revision: state.revision + 1 })
    })
  }

  async observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      const state = this.addressed(request.target)
      if (state.status !== 'open') return state
      try {
        return await this.page(state, request.signal)
      } catch (error) {
        if (error instanceof BrowserRuntimeError && error.code === 'BROWSER_RUNTIME_UNAVAILABLE') {
          return this.scheduleRecovery('unhealthy', true) ?? this.state ?? state
        }
        throw error
      }
    })
  }

  async screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      const page = await this.page(state, request.signal)
      const { response, bytes } = await this.request('/screenshot', {
        method: 'GET',
        headers: { 'x-tab-id': this.upstreamTabId() },
      }, request.signal)
      if (response.headers.get('content-type')?.split(';', 1)[0] !== 'image/png') {
        throw new BrowserRuntimeError('Tandem screenshot response must be image/png', 'BROWSER_PROTOCOL')
      }
      return Object.freeze({
        target: state.target,
        revision: state.revision,
        url: page.url,
        title: page.title,
        mediaType: 'image/png' as const,
        data: Buffer.from(bytes).toString('base64'),
      })
    })
  }

  async focus(request: BrowserMutationRequest): Promise<BrowserPageState> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      const response = objectValue(await this.json('/tabs/focus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tabId: this.upstreamTabId() }),
      }, request.signal), 'tab focus')
      if (response.ok !== true) throw new BrowserRuntimeError('Tandem did not focus the addressed tab', 'BROWSER_PROTOCOL')
      return this.commit({ ...state, revision: state.revision + 1, focused: true })
    })
  }

  async close(request: BrowserMutationRequest): Promise<BrowserClosedState> {
    assertNotAborted(request.signal)
    return this.exclusive(async () => {
      assertNotAborted(request.signal)
      const state = this.addressed(request.target)
      this.expected(state, request.expectedRevision)
      if (state.status === 'closed') throw new BrowserRuntimeError('browser target is closed', 'BROWSER_NOT_OPEN')
      if (this.process !== undefined) {
        const response = objectValue(await this.json('/sessions/destroy', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: this.sessionName }),
        }, request.signal), 'session destroy')
        if (response.ok !== true) throw new BrowserRuntimeError('Tandem did not destroy the temporary session', 'BROWSER_PROTOCOL')
      }
      const closed = this.commit({ status: 'closed' as const, target: state.target, revision: state.revision + 1 })
      await this.stopProcess()
      return closed
    })
  }

  /** Drain admitted work, close the temporary Tandem session when possible, and join its process tree. */
  private async teardown(): Promise<void> {
    this.closing = true
    await this.queue
    if (this.state?.status === 'open' || this.state?.status === 'unavailable') {
      try {
        if (this.process !== undefined) {
          await this.json('/sessions/destroy', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: this.sessionName }),
          }, undefined)
        }
      } catch (error) {
        this.ctx.logger.warn('browser-runtime-tandem: temporary session cleanup failed before process teardown')
        this.ctx.logger.warn(error)
      }
      this.commit({ status: 'closed', target: this.state.target, revision: this.state.revision + 1 })
    }
    await this.stopProcess()
    this.disposed = true
  }
}

export default TandemBrowserRuntime
