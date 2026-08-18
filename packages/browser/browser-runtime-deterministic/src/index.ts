/**
 * Deterministic keyless Browser Runtime Provider for temporary and named persistent Profiles.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic
 */

import { Buffer } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  addressedBrowserRuntimeStateFrom,
  assertBrowserNotAborted,
  assertBrowserProfileWriterAvailable,
  browserProfileStorage,
  BrowserRuntime,
  BrowserRuntimeError,
  browserTargetFor,
  commitBrowserRuntimeState,
  emitBrowserRuntimeState,
  EMPTY_BROWSER_PROFILE_STORAGE,
  requireOpenBrowserPage,
  resolveBrowserProfileCreate,
} from '@deepseek-ai/dsh-browser-runtime'
import type {
  BrowserClosedState,
  BrowserCreateRequest,
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
import {
  registerRuntimeStateReader,
  RUNTIME_STATE_OWNER,
  runtimeStateValidator,
  type RuntimeStateOwner,
} from './runtime-state.ts'

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** One URL and its deterministic observable and screenshot facts. */
export interface DeterministicBrowserPage {
  /** Exact URL accepted by `navigate`. */
  url: string
  /** Page title returned by observations. */
  title: string
  /** Page text returned by observations. */
  text: string
  /** Non-empty canonical base64 whose decoded bytes start with the PNG signature. */
  screenshotPngBase64: string
}

/** Deterministic Provider configuration. */
export interface Config {
  /** Prefix used for the four stable opaque identities. */
  idPrefix?: string
  /** Complete pages this keyless Provider can navigate to. */
  pages: DeterministicBrowserPage[]
}

/** Runtime configuration schema for the deterministic Browser Runtime Provider. */
export const Config: z<Config> = z.object({
  idPrefix: z.string().min(1).default('browser-trace'),
  pages: z.array(z.object({
    url: z.string().min(1).required(),
    title: z.string().min(1).required(),
    text: z.string().required(),
    screenshotPngBase64: z.string().min(1).required(),
  })).required(),
})

/** Complete config after Schemastery applies its defaults. */
type ResolvedConfig = Required<Config>

/** Partition-backed page identity retained for a named Profile after close. */
interface PersistedProfile {
  readonly url: string
  readonly title: string
  readonly text: string
  readonly storage: BrowserProfileStorage
  readonly chrome: BrowserProfileChrome
  readonly sessionName: string
  readonly tabSeq: number
}

/** Decode one canonical, non-empty PNG fixture or fail Provider loading. */
function validateScreenshot(url: string, value: string): void {
  if (value.length === 0 || !CANONICAL_BASE64.test(value)) {
    throw new Error(
      `browser-runtime-deterministic: page ${JSON.stringify(url)} screenshotPngBase64 must be non-empty canonical base64 data`,
    )
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) {
    throw new Error(
      `browser-runtime-deterministic: page ${JSON.stringify(url)} screenshotPngBase64 must be non-empty canonical base64 data`,
    )
  }
  if (bytes.length < PNG_SIGNATURE.length
    || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error(
      `browser-runtime-deterministic: page ${JSON.stringify(url)} screenshotPngBase64 must contain PNG data`,
    )
  }
}

/**
 * Multi-Profile deterministic Browser Runtime. Every operation enters one serialized queue;
 * mutations require the last observed revision of the addressed target, run the package
 * invariant before assignment, and publish only committed state.
 */
export class DeterministicBrowserRuntime extends BrowserRuntime {
  static Config = Config

  /** Package-private identity for this concrete Provider generation. */
  readonly [RUNTIME_STATE_OWNER]: RuntimeStateOwner = Object.freeze({})

  private readonly pages: ReadonlyMap<string, DeterministicBrowserPage>
  private readonly idPrefix: string
  private readonly states = new Map<string, BrowserRuntimeState>()
  private readonly persisted = new Map<string, PersistedProfile>()
  private temporarySeq = 0

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const resolved = config as ResolvedConfig
    if (resolved.pages.length === 0) {
      throw new Error('browser-runtime-deterministic: config.pages must contain at least one page')
    }
    const pages = new Map<string, DeterministicBrowserPage>()
    for (const page of resolved.pages) {
      if (pages.has(page.url)) {
        throw new Error(`browser-runtime-deterministic: duplicate page URL ${JSON.stringify(page.url)}`)
      }
      validateScreenshot(page.url, page.screenshotPngBase64)
      pages.set(page.url, Object.freeze({ ...page }))
    }
    this.pages = pages
    this.idPrefix = resolved.idPrefix
    ctx.effect(
      () => registerRuntimeStateReader(this[RUNTIME_STATE_OWNER], () => this.states),
      'deterministic browser runtime state reader',
    )
    ctx.effect(() => () => this.teardown(), 'deterministic browser runtime teardown')
  }

  /** Publish one committed state while containing every post-commit observer failure. */
  private notifyState(state: BrowserRuntimeState): void {
    emitBrowserRuntimeState(this.ctx, state, (error) => {
      this.warnStateObserverFailure(error)
    })
  }

  /** Log one contained state-observer failure without reading it through an unsafe coercion. */
  private warnStateObserverFailure(error: unknown): void {
    this.ctx.logger.warn('browser-runtime-deterministic: a browser/runtime-state observer failed')
    this.ctx.logger.warn(error)
  }

  /** Validate and assign one authoritative state, then notify non-vetoing observers. */
  private commit<T extends BrowserRuntimeState>(state: T): T {
    return commitBrowserRuntimeState(
      this.states,
      runtimeStateValidator(this[RUNTIME_STATE_OWNER]),
      (committed) => { this.notifyState(committed) },
      state,
    )
  }

  /** Resolve and validate the addressed state. */
  private addressed(target: BrowserTarget): BrowserRuntimeState {
    return addressedBrowserRuntimeStateFrom(this.states, target)
  }

  /** Resolve an open page or reject a closed target. */
  private open(target: BrowserTarget): BrowserPageState {
    return requireOpenBrowserPage(this.addressed(target))
  }

  /** Enforce optimistic mutation ordering. */
  private expected(state: BrowserRuntimeState, revision: number): void {
    if (state.revision !== revision) {
      throw new BrowserRuntimeError(
        `browser revision conflict: expected ${String(revision)}, current ${String(state.revision)}`,
        'BROWSER_REVISION_CONFLICT',
      )
    }
  }

  async create(request: BrowserCreateRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      if (request.profile === 'temporary') {
        this.temporarySeq += 1
        const created = resolveBrowserProfileCreate(this.idPrefix, request, this.temporarySeq)
        return this.commit({
          status: 'open',
          target: browserTargetFor(created.profileId, created.sessionName, 1),
          revision: 0,
          url: 'about:blank',
          title: 'New Tab',
          text: '',
          focused: false,
          chrome: created.chrome,
          storage: EMPTY_BROWSER_PROFILE_STORAGE,
        })
      }
      const created = resolveBrowserProfileCreate(this.idPrefix, request, this.temporarySeq)
      assertBrowserProfileWriterAvailable(this.states.values(), created.chrome.partition, request.name)
      const stored = this.persisted.get(created.sessionName)
      if (stored !== undefined) {
        const nextSeq = stored.tabSeq + 1
        return this.commit({
          status: 'open',
          target: browserTargetFor(created.profileId, created.sessionName, nextSeq),
          revision: 0,
          url: stored.url,
          title: stored.title,
          text: stored.text,
          focused: false,
          chrome: stored.chrome,
          storage: stored.storage,
        })
      }
      return this.commit({
        status: 'open',
        target: browserTargetFor(created.profileId, created.sessionName, 1),
        revision: 0,
        url: 'about:blank',
        title: 'New Tab',
        text: '',
        focused: false,
        chrome: created.chrome,
        storage: EMPTY_BROWSER_PROFILE_STORAGE,
      })
    })
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      const page = this.pages.get(request.url)
      if (page === undefined) {
        throw new BrowserRuntimeError(`deterministic browser page is not configured: ${request.url}`, 'BROWSER_UNKNOWN_URL')
      }
      const storage = state.chrome.kind === 'persistent' && state.chrome.name !== undefined
        ? browserProfileStorage(state.chrome.name)
        : EMPTY_BROWSER_PROFILE_STORAGE
      return this.commit({
        status: 'open',
        target: state.target,
        revision: state.revision + 1,
        url: page.url,
        title: page.title,
        text: page.text,
        focused: state.focused,
        chrome: state.chrome,
        storage,
      })
    })
  }

  async observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      return this.addressed(request.target)
    })
  }

  async screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      const state = this.open(request.target)
      const page = this.pages.get(state.url)
      if (page === undefined) {
        throw new BrowserRuntimeError(`deterministic browser page is not configured: ${state.url}`, 'BROWSER_UNKNOWN_URL')
      }
      return Object.freeze({
        target: state.target,
        revision: state.revision,
        url: state.url,
        title: state.title,
        mediaType: 'image/png' as const,
        data: page.screenshotPngBase64,
      })
    })
  }

  async focus(request: BrowserMutationRequest): Promise<BrowserPageState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      return this.commit({ ...state, revision: state.revision + 1, focused: true })
    })
  }

  async close(request: BrowserMutationRequest): Promise<BrowserClosedState> {
    assertBrowserNotAborted(request.signal)
    return this.exclusive(() => {
      assertBrowserNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      this.rememberPersistent(state)
      return this.commit({ status: 'closed', target: state.target, revision: state.revision + 1 })
    })
  }

  /** Snapshot one named Profile so a later create can restore its identity. */
  private rememberPersistent(state: BrowserPageState): void {
    if (state.chrome.kind !== 'persistent') return
    const sessionName = state.chrome.partition.slice('persist:session-'.length)
    const previous = this.persisted.get(sessionName)
    this.persisted.set(sessionName, Object.freeze({
      url: state.url,
      title: state.title,
      text: state.text,
      storage: state.storage,
      chrome: state.chrome,
      sessionName,
      tabSeq: (previous?.tabSeq ?? 0) + 1,
    }))
  }

  /** Finish accepted operations, close every open Profile, then drop persist memory. */
  private async teardown(): Promise<void> {
    this.closing = true
    await this.queue
    for (const state of [...this.states.values()]) {
      if (state.status === 'open') {
        this.rememberPersistent(state)
        this.commit({ status: 'closed', target: state.target, revision: state.revision + 1 })
      }
    }
    this.persisted.clear()
    this.disposed = true
  }
}

export default DeterministicBrowserRuntime
