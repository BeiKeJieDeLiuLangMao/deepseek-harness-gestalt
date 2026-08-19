/**
 * In-process Electron Browser Runtime for temporary and named persistent Profiles.
 * @module @deepseek-ai/dsh-browser-runtime-electron
 */

/* jscpd:ignore-start */
import { Buffer } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  addressedBrowserRuntimeStateFrom,
  assertBrowserCreateAttach,
  assertBrowserNotAborted,
  assertBrowserProfileWriterAvailable,
  browserProfileStorage,
  BrowserRuntime,
  BrowserRuntimeError,
  browserTargetFor,
  browserTargetKey,
  commitBrowserRuntimeState,
  emitBrowserRuntimeState,
  EMPTY_BROWSER_PROFILE_STORAGE,
  requireExpectedBrowserRevision,
  resolveBrowserCreateAttach,
  resolveBrowserProfileCreate,
} from '@deepseek-ai/dsh-browser-runtime'
import type {
  BrowserClosedState,
  BrowserCreateRequest,
  BrowserInputRequest,
  BrowserMutationRequest,
  BrowserNavigateRequest,
  BrowserObserveRequest,
  BrowserPageState,
  BrowserProfileChrome,
  BrowserProfileStorage,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-runtime'
/* jscpd:ignore-end */
import {
  isElectronProcess,
  loadElectronHost,
  type ElectronBrowserWindow,
  type ElectronHost,
  type ElectronSession,
} from './electron.ts'
import {
  ELECTRON_RUNTIME_STATE_OWNER,
  electronRuntimeStateValidator,
  registerElectronRuntimeStateReader,
  type ElectronRuntimeStateOwner,
} from './runtime-state.ts'

const MAX_TIMER_DELAY_MS = 2_147_483_647
const PAGE_TEXT_SCRIPT = `(() => {
  const root = document.body ?? document.documentElement
  return root === null ? '' : (root.innerText ?? '')
})()`

/** Process and lifecycle configuration for one in-process Electron runtime. */
export interface Config {
  /** Prefix for DSH-owned opaque Profile, Workspace, and browser identities. */
  idPrefix?: string
  /** Hidden window width used for offscreen capture. */
  viewportWidth?: number
  /** Hidden window height used for offscreen capture. */
  viewportHeight?: number
  /** Bound on each Chromium navigation or content read. */
  requestTimeoutMs?: number
  /** Injected Electron APIs for tests; omitted in production. */
  electron?: ElectronHost
}

/** Runtime configuration schema for the in-process Electron Browser Provider. */
export const Config: z<Config> = z.object({
  idPrefix: z.string().default('electron'),
  viewportWidth: z.number().default(1280),
  viewportHeight: z.number().default(800),
  requestTimeoutMs: z.number().default(30_000),
})

type ResolvedConfig = Required<Omit<Config, 'electron'>> & Pick<Config, 'electron'>

/** One open Electron Profile lifecycle owned by this Provider. */
interface OpenProfile {
  readonly sessionName: string
  readonly chrome: BrowserProfileChrome
  readonly session: ElectronSession
  readonly tabs: Map<string, OpenTab>
}

/** Hidden window and contents for one open tab. */
interface OpenTab {
  readonly window: ElectronBrowserWindow
  readonly stopCrashWatch: () => void
}

/** Observed Chromium page facts. */
interface ObservedPage {
  readonly url: string
  readonly title: string
  readonly text: string
}

/** Reject an invalid deployment-varying duration before creating windows. */
function assertDuration(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`browser-runtime-electron: ${name} must be a positive safe integer no greater than ${String(MAX_TIMER_DELAY_MS)}`)
  }
}

/** Reject an invalid viewport dimension. */
function assertViewport(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`browser-runtime-electron: ${name} must be a positive safe integer`)
  }
}

/** Reject empty strings that Schemastery's required marker still admits. */
function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`browser-runtime-electron: ${name} must be non-empty`)
}

/** Fail composition unless this process is Electron or a test injects Electron APIs. */
function assertElectronAvailable(electron: ElectronHost | undefined): void {
  if (electron !== undefined) return
  if (!isElectronProcess()) {
    throw new Error('browser-runtime-electron: process.versions.electron must be set; this Provider loads only inside Electron')
  }
}

/** Choose restored or empty identity facts for one newly opened Profile. */
function resolveCreateStorage(name: string | undefined): BrowserProfileStorage {
  return name === undefined ? EMPTY_BROWSER_PROFILE_STORAGE : browserProfileStorage(name)
}

/** Read a string from untrusted Chromium script output. */
function textValue(value: unknown, subject: string): string {
  if (typeof value !== 'string') {
    throw new BrowserRuntimeError(`Electron ${subject} must be a string`, 'BROWSER_PROTOCOL')
  }
  return value
}

/** In-process Electron Browser Runtime for temporary and named persistent Profiles. */
export class ElectronBrowserRuntime extends BrowserRuntime {
  static Config = Config

  /** Package-private identity for this concrete Provider generation. */
  readonly [ELECTRON_RUNTIME_STATE_OWNER]: ElectronRuntimeStateOwner = Object.freeze({})

  private readonly config: ResolvedConfig
  private readonly states = new Map<string, BrowserRuntimeState>()
  private readonly profiles = new Map<string, OpenProfile>()
  private host: ElectronHost | undefined
  private temporarySeq = 0
  private recoveryScheduled = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const resolved = config as ResolvedConfig
    assertNonEmpty('idPrefix', resolved.idPrefix)
    assertViewport('viewportWidth', resolved.viewportWidth)
    assertViewport('viewportHeight', resolved.viewportHeight)
    assertDuration('requestTimeoutMs', resolved.requestTimeoutMs)
    assertElectronAvailable(resolved.electron)
    this.config = resolved
    this.host = resolved.electron
    ctx.effect(
      () => registerElectronRuntimeStateReader(this[ELECTRON_RUNTIME_STATE_OWNER], () => this.states),
      'Electron Browser Runtime state reader',
    )
    ctx.effect(() => () => this.teardown(), 'Electron Browser Runtime teardown')
  }

  /* jscpd:ignore-start */
  /** Emit one committed state while containing broken ordinary observers. */
  private notifyState(state: BrowserRuntimeState): void {
    emitBrowserRuntimeState(this.ctx, state, (error) => {
      this.ctx.logger.warn('browser-runtime-electron: a browser/runtime-state observer failed')
      this.ctx.logger.warn(error)
    })
  }

  /** Commit and publish one immutable Provider state. */
  private commit<T extends BrowserRuntimeState>(state: T): T {
    return commitBrowserRuntimeState(
      this.states,
      electronRuntimeStateValidator(this[ELECTRON_RUNTIME_STATE_OWNER]),
      (committed) => { this.notifyState(committed) },
      state,
    )
  }

  /** Resolve the addressed Provider state. */
  private addressed(target: BrowserTarget): BrowserRuntimeState {
    return addressedBrowserRuntimeStateFrom(this.states, target)
  }

  /** Resolve an open page or reject its terminal close receipt. */
  protected override openPage(target: BrowserTarget): BrowserPageState {
    const state = this.addressed(target)
    if (state.status !== 'open') {
      throw new BrowserRuntimeError(
        state.status === 'unavailable' ? 'Electron browser runtime is unavailable' : 'browser target is closed',
        state.status === 'unavailable' ? 'BROWSER_RUNTIME_UNAVAILABLE' : 'BROWSER_NOT_OPEN',
      )
    }
    return state
  }

  /** Enforce optimistic mutation ordering. */
  protected override expectRevision(state: BrowserRuntimeState, revision: number): void {
    requireExpectedBrowserRevision(state, revision)
  }

  /** Commit one next open page after a control-owner mutation. */
  protected override commitPage(state: BrowserPageState): BrowserPageState {
    return this.commit(state)
  }
  /* jscpd:ignore-end */

  /** Resolve the open Electron Profile for one addressed target. */
  private openProfile(target: BrowserTarget): OpenProfile {
    const profile = this.profiles.get(target.profileId)
    if (profile === undefined) {
      throw new BrowserRuntimeError('Electron no longer reports the addressed tab', 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    return profile
  }

  /** Resolve the hidden window for one addressed target. */
  private openTab(target: BrowserTarget): OpenTab {
    const tab = this.openProfile(target).tabs.get(target.tabId)
    if (tab === undefined || tab.window.isDestroyed() || tab.window.webContents.isDestroyed()) {
      throw new BrowserRuntimeError('Electron no longer reports the addressed tab', 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    return tab
  }

  /** First open page, used when a renderer crash has to recover one visible tab. */
  private firstOpen(): BrowserPageState | undefined {
    return [...this.states.values()].find((state): state is BrowserPageState => state.status === 'open')
  }

  /** Load Electron APIs once after plugin construction. */
  private async hostApis(): Promise<ElectronHost> {
    if (this.host !== undefined) return this.host
    this.host = await loadElectronHost()
    return this.host
  }

  /** Bound one Chromium operation by requestTimeoutMs and the caller signal. */
  private async withTimeout<T>(signal: AbortSignal | undefined, operation: (combined: AbortSignal) => Promise<T>): Promise<T> {
    assertBrowserNotAborted(signal)
    const deadline = AbortSignal.timeout(this.config.requestTimeoutMs)
    const combined = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
    try {
      return await operation(combined)
    } catch (error) {
      if (signal?.aborted) assertBrowserNotAborted(signal)
      if (error instanceof BrowserRuntimeError) {
        if (error.code === 'BROWSER_ABORTED' && signal?.aborted !== true) {
          throw new BrowserRuntimeError(`Electron operation failed: ${error.message}`, 'BROWSER_RUNTIME_UNAVAILABLE')
        }
        throw error
      }
      throw new BrowserRuntimeError(`Electron operation failed: ${String(error)}`, 'BROWSER_RUNTIME_UNAVAILABLE')
    }
  }

  /** Create or reuse the Chromium session for one persist or ephemeral partition. */
  private sessionFor(chrome: BrowserProfileChrome, host: ElectronHost): ElectronSession {
    return host.session.fromPartition(chrome.partition)
  }

  /** Open one hidden offscreen window in the Profile partition. */
  private createWindow(profile: OpenProfile, host: ElectronHost): ElectronBrowserWindow {
    return new host.BrowserWindow({
      show: false,
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        partition: profile.chrome.partition,
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
  }

  /** Watch renderer-process loss and project an unavailable state. */
  private watchCrash(target: BrowserTarget, window: ElectronBrowserWindow): () => void {
    const onGone = (): void => {
      this.scheduleRecovery(target, 'crashed', true)
    }
    window.webContents.on('render-process-gone', onGone)
    return () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.off('render-process-gone', onGone)
      }
    }
  }

  /** Destroy one hidden window if this Profile still records it. */
  private destroyExistingTab(profile: OpenProfile, tabId: string): void {
    const tab = profile.tabs.get(tabId)
    if (tab === undefined) return
    this.destroyTab(tab)
  }

  /** Destroy one hidden window without throwing after Chromium already closed it. */
  private destroyTab(tab: OpenTab): void {
    tab.stopCrashWatch()
    if (tab.window.isDestroyed()) return
    tab.window.destroy()
  }

  /** Read URL, title, and visible text from one hidden contents. */
  private async observeContents(window: ElectronBrowserWindow, signal: AbortSignal | undefined): Promise<ObservedPage> {
    return this.withTimeout(signal, async (combined) => {
      const text = await Promise.race([
        window.webContents.executeJavaScript(PAGE_TEXT_SCRIPT),
        new Promise<never>((_, reject) => {
          combined.addEventListener('abort', () => {
            reject(new BrowserRuntimeError(`browser operation aborted: ${String(combined.reason)}`, 'BROWSER_ABORTED'))
          }, { once: true })
        }),
      ])
      return Object.freeze({
        url: window.webContents.getURL(),
        title: window.webContents.getTitle(),
        text: textValue(text, 'page text'),
      })
    })
  }

  /** Re-read one open page without advancing its DSH revision. */
  private async page(state: BrowserPageState, signal: AbortSignal | undefined): Promise<BrowserPageState> {
    const observed = await this.observeContents(this.openTab(state.target).window, signal)
    const storage = state.chrome.kind === 'persistent' && state.chrome.name !== undefined
      ? browserProfileStorage(state.chrome.name)
      : EMPTY_BROWSER_PROFILE_STORAGE
    return Object.freeze({ ...state, url: observed.url, title: observed.title, text: observed.text, storage })
  }

  /** Navigate one hidden contents and wait for the first successful load. */
  private async load(window: ElectronBrowserWindow, url: string, signal: AbortSignal | undefined): Promise<void> {
    await this.withTimeout(signal, async (combined) => {
      const aborted = new Promise<never>((_, reject) => {
        combined.addEventListener('abort', () => {
          reject(new BrowserRuntimeError(`browser operation aborted: ${String(combined.reason)}`, 'BROWSER_ABORTED'))
        }, { once: true })
      })
      await Promise.race([window.webContents.loadURL(url), aborted])
    })
  }

  /** Capture one PNG screenshot of the hidden contents. */
  private async capture(window: ElectronBrowserWindow, signal: AbortSignal | undefined): Promise<string> {
    return this.withTimeout(signal, async (combined) => {
      const image = await Promise.race([
        window.webContents.capturePage(),
        new Promise<never>((_, reject) => {
          combined.addEventListener('abort', () => {
            reject(new BrowserRuntimeError(`browser operation aborted: ${String(combined.reason)}`, 'BROWSER_ABORTED'))
          }, { once: true })
        }),
      ])
      const bytes = image.toPNG()
      if (bytes.byteLength === 0) {
        throw new BrowserRuntimeError('Electron screenshot response must be image/png', 'BROWSER_PROTOCOL')
      }
      return Buffer.from(bytes).toString('base64')
    })
  }

  /** Persist named Profile storage; temporary partitions stay in memory. */
  private async flush(profile: OpenProfile): Promise<void> {
    if (profile.chrome.kind !== 'persistent') return
    await profile.session.flushStorageData()
  }

  /** Drop temporary partition storage after its last tab closes. */
  private async forgetTemporary(profile: OpenProfile): Promise<void> {
    if (profile.chrome.kind !== 'temporary') return
    await profile.session.clearStorageData()
  }

  /* jscpd:ignore-start */
  /** Project availability loss and append one recovery transaction behind admitted work. */
  private scheduleRecovery(
    target: BrowserTarget,
    reason: 'crashed' | 'unhealthy',
    projectNow: boolean,
  ): BrowserRuntimeState | undefined {
    if (this.recoveryScheduled || [...this.states.values()].every(state => state.status === 'closed')) {
      return this.firstOpen() ?? [...this.states.values()].at(-1)
    }
    const lastOpen = this.states.get(browserTargetKey(target))
    const open = lastOpen !== undefined && lastOpen.status === 'open' ? lastOpen : this.firstOpen()
    if (open === undefined) return this.firstOpen() ?? [...this.states.values()].at(-1)
    this.recoveryScheduled = true
    const projected = projectNow
      ? this.commit({
        status: 'unavailable' as const,
        target: open.target,
        revision: open.revision + 1,
        reason,
        reconnecting: true,
        controlOwner: open.controlOwner,
      })
      : undefined
    const recovery = this.queue.then(async () => {
      if (this.closing || this.disposed) return
      const current = this.addressed(open.target)
      const unavailable = projected ?? this.commit({
        status: 'unavailable' as const,
        target: open.target,
        revision: current.revision + 1,
        reason,
        reconnecting: true,
        controlOwner: open.controlOwner,
      })
      await this.reconnect(open, unavailable)
    })
    this.queue = recovery.then(() => undefined, (error: unknown) => {
      this.ctx.logger.warn('browser-runtime-electron: reconnect transaction failed')
      this.ctx.logger.warn(error)
    })
    void recovery.then(() => undefined, () => undefined).finally(() => { this.recoveryScheduled = false })
    return projected
  }

  /** Recreate the hidden window for one crashed tab and restore its last URL. */
  private async reconnect(
    lastOpen: BrowserPageState,
    unavailable: Extract<BrowserRuntimeState, { status: 'unavailable' }>,
  ): Promise<void> {
    if (this.closing || this.disposed) return
    try {
      const host = await this.hostApis()
      const profile = this.openProfile(lastOpen.target)
      this.destroyExistingTab(profile, lastOpen.target.tabId)
      const window = this.createWindow(profile, host)
      const tab: OpenTab = { window, stopCrashWatch: this.watchCrash(lastOpen.target, window) }
      profile.tabs.set(lastOpen.target.tabId, tab)
      await this.load(window, lastOpen.url, undefined)
      const restored = await this.page(lastOpen, undefined)
      this.commit({ ...restored, revision: unavailable.revision + 1, focused: false, controlOwner: lastOpen.controlOwner })
    } catch (error) {
      this.ctx.logger.warn('browser-runtime-electron: reconnect attempts exhausted')
      this.ctx.logger.warn(error)
      this.commitReconnectFailed(unavailable.target)
    }
  }
  /* jscpd:ignore-end */

  /** Commit reconnect-failed when the target is still unavailable. */
  private commitReconnectFailed(target: BrowserTarget): void {
    const current = this.states.get(browserTargetKey(target))
    if (current?.status !== 'unavailable') return
    this.commit({
      ...current,
      revision: current.revision + 1,
      reason: 'reconnect-failed',
      reconnecting: false,
    })
  }

  /* jscpd:ignore-start */
  async create(request: BrowserCreateRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const attached = resolveBrowserCreateAttach(this.states.values(), request.attach)
      if (request.profile === 'temporary' && attached === undefined) this.temporarySeq += 1
      const created = attached === undefined
        ? resolveBrowserProfileCreate(this.config.idPrefix, request, this.temporarySeq)
        : {
          profileId: attached.target.profileId,
          sessionName: this.openProfile(attached.target).sessionName,
          chrome: attached.chrome,
        }
      if (request.profile === 'persistent' && request.attach === undefined) {
        assertBrowserProfileWriterAvailable(this.states.values(), created.chrome.partition, request.name)
      }
      assertBrowserCreateAttach(this.states.values(), created.profileId, request.attach)
      const host = await this.hostApis()
      const existing = this.profiles.get(created.profileId)
      const profile = existing ?? {
        sessionName: created.sessionName,
        chrome: created.chrome,
        session: this.sessionFor(created.chrome, host),
        tabs: new Map<string, OpenTab>(),
      }
      const historical = [...this.states.values()].filter(state => state.target.profileId === created.profileId)
      const tabSeq = historical.length + 1
      const target = browserTargetFor(created.profileId, created.sessionName, tabSeq, request.attach)
      const window = this.createWindow(profile, host)
      const tab: OpenTab = { window, stopCrashWatch: this.watchCrash(target, window) }
      profile.tabs.set(target.tabId, tab)
      this.profiles.set(created.profileId, profile)
      try {
        await this.load(window, 'about:blank', request.signal)
        const observed = await this.observeContents(window, request.signal)
        const name = created.chrome.name
        return this.commit({
          status: 'open',
          target,
          revision: 0,
          url: observed.url,
          title: observed.title,
          text: observed.text,
          focused: false,
          controlOwner: 'agent',
          chrome: created.chrome,
          storage: resolveCreateStorage(name),
        })
      } catch (error) {
        this.destroyTab(tab)
        profile.tabs.delete(target.tabId)
        if (this.profiles.get(created.profileId) === profile && profile.tabs.size === 0) {
          this.profiles.delete(created.profileId)
        }
        throw error
      }
    })
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const state = this.openPage(request.target)
      this.expectRevision(state, request.expectedRevision)
      await this.load(this.openTab(request.target).window, request.url, request.signal)
      const page = await this.page(state, request.signal)
      return this.commit({ ...page, revision: state.revision + 1, controlOwner: 'agent' })
    })
  }

  async observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const state = this.addressed(request.target)
      if (state.status !== 'open') return state
      try {
        return await this.page(state, request.signal)
      } catch (error) {
        if (error instanceof BrowserRuntimeError && error.code === 'BROWSER_RUNTIME_UNAVAILABLE') {
          return this.scheduleRecovery(request.target, 'unhealthy', true)
            ?? this.states.get(browserTargetKey(request.target))
            ?? state
        }
        throw error
      }
    })
  }

  async screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const state = this.openPage(request.target)
      const page = await this.page(state, request.signal)
      const data = await this.capture(this.openTab(request.target).window, request.signal)
      return Object.freeze({
        target: state.target,
        revision: state.revision,
        url: page.url,
        title: page.title,
        mediaType: 'image/png' as const,
        data,
      })
    })
  }

  async focus(request: BrowserMutationRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      const state = this.openPage(request.target)
      this.expectRevision(state, request.expectedRevision)
      this.openTab(request.target).window.webContents.focus()
      return this.commit({ ...state, revision: state.revision + 1, focused: true, controlOwner: 'agent' })
    })
  }

  async input(request: BrowserInputRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const state = this.openPage(request.target)
      this.expectRevision(state, request.expectedRevision)
      if (request.url !== undefined) {
        await this.load(this.openTab(request.target).window, request.url, request.signal)
      }
      const page = await this.page(state, request.signal)
      return this.commit({
        ...page,
        revision: state.revision + 1,
        text: request.text ?? page.text,
        controlOwner: 'human',
      })
    })
  }

  async close(request: BrowserMutationRequest): Promise<BrowserClosedState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(async () => {
      assertBrowserNotAborted(request.signal)
      const state = this.addressed(request.target)
      this.expectRevision(state, request.expectedRevision)
      if (state.status === 'closed') throw new BrowserRuntimeError('browser target is closed', 'BROWSER_NOT_OPEN')
      const profile = this.openProfile(request.target)
      const tab = profile.tabs.get(state.target.tabId)
      if (tab !== undefined) this.destroyTab(tab)
      profile.tabs.delete(state.target.tabId)
      const lastTab = profile.tabs.size === 0
      if (lastTab) {
        await this.flush(profile)
        await this.forgetTemporary(profile)
        this.profiles.delete(state.target.profileId)
      }
      return this.commit({ status: 'closed' as const, target: state.target, revision: state.revision + 1 })
    })
  }
  /* jscpd:ignore-end */

  /** Drain admitted work and destroy remaining hidden windows. */
  private async teardown(): Promise<void> {
    this.closing = true
    await this.queue
    for (const state of [...this.states.values()]) {
      if (state.status !== 'open' && state.status !== 'unavailable') continue
      const profile = this.profiles.get(state.target.profileId)
      const tab = profile?.tabs.get(state.target.tabId)
      if (tab !== undefined) this.destroyTab(tab)
      profile?.tabs.delete(state.target.tabId)
      this.commit({ status: 'closed', target: state.target, revision: state.revision + 1 })
    }
    for (const profile of this.profiles.values()) {
      try {
        await this.flush(profile)
        await this.forgetTemporary(profile)
      } catch (error) {
        this.ctx.logger.warn('browser-runtime-electron: partition cleanup failed before teardown')
        this.ctx.logger.warn(error)
      }
    }
    this.profiles.clear()
    this.disposed = true
  }
}

export default ElectronBrowserRuntime
export { electronHostFromModule, isElectronProcess, loadElectronHost, requireElectronProcess } from './electron.ts'
export type {
  ElectronBrowserWindowConstructor,
  ElectronBrowserWindowOptions,
  ElectronHost,
  ElectronSessionModule,
} from './electron.ts'
export { listenElectronBrowserHttp } from './http.ts'
export type { ElectronBrowserHttpServer } from './http.ts'
export { TANDEM_UPSTREAM_REVISION, TANDEM_UPSTREAM_VERSION } from './protocol.ts'
