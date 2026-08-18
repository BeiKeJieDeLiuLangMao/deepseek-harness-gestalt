/**
 * Deterministic keyless Browser Runtime Provider for one temporary Profile and tab.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic
 */

import { Buffer } from 'node:buffer'
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
import { registerRuntimeStateReader } from './runtime-state.ts'

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

/** Return whether two opaque target values address the same Browser Runtime resources. */
function sameTarget(left: BrowserTarget, right: BrowserTarget): boolean {
  return left.profileId === right.profileId
    && left.workspaceId === right.workspaceId
    && left.browserId === right.browserId
    && left.tabId === right.tabId
}

/** Throw the canonical abort failure before touching Provider state. */
function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new BrowserRuntimeError(`browser operation aborted: ${String(signal.reason)}`, 'BROWSER_ABORTED')
  }
}

/** Freeze one target so returned state cannot mutate the Provider's relationship keys. */
function targetFor(prefix: string): BrowserTarget {
  return Object.freeze({
    profileId: BrowserProfileId(`${prefix}-profile`),
    workspaceId: BrowserWorkspaceId(`${prefix}-workspace`),
    browserId: BrowserInstanceId(`${prefix}-browser`),
    tabId: BrowserTabId(`${prefix}-tab`),
  })
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
 * One-state deterministic Browser Runtime. Every operation enters one serialized queue;
 * mutations require the last observed revision and commit a lifecycle publication only
 * after the state changes.
 */
export class DeterministicBrowserRuntime extends BrowserRuntime {
  static Config = Config

  private readonly pages: ReadonlyMap<string, DeterministicBrowserPage>
  private readonly target: BrowserTarget
  private state: BrowserRuntimeState | undefined
  private queue: Promise<void> = Promise.resolve()
  private closing = false
  private disposed = false

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
    this.target = targetFor(resolved.idPrefix)
    ctx.effect(
      () => registerRuntimeStateReader(ctx.root, () => this.state),
      'deterministic browser runtime state reader',
    )
    ctx.effect(() => () => this.teardown(), 'deterministic browser runtime teardown')
  }

  /** Reject work that enters after teardown begins. */
  private assertAccepting(): void {
    if (this.closing || this.disposed) {
      throw new BrowserRuntimeError('browser runtime is disposed', 'BROWSER_DISPOSED')
    }
  }

  /** Serialize one accepted operation behind all earlier reads and mutations. */
  private exclusive<T>(operation: () => T): Promise<T> {
    this.assertAccepting()
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  /** Publish one committed state while containing every post-commit observer failure. */
  private notifyState(state: BrowserRuntimeState): void {
    const args = ['browser/runtime-state', state]
    for (const listener of this.ctx.events.dispatch('emit', args) as Array<(value: BrowserRuntimeState) => unknown>) {
      try {
        const returned = listener(state)
        if (returned != null && typeof (returned as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(returned as PromiseLike<unknown>).then(undefined, (error: unknown) => {
            this.warnStateObserverFailure(error)
          })
        }
      } catch (error) {
        this.warnStateObserverFailure(error)
      }
    }
  }

  /** Log one contained state-observer failure without reading it through an unsafe coercion. */
  private warnStateObserverFailure(error: unknown): void {
    this.ctx.logger.warn('browser-runtime-deterministic: a browser/runtime-state observer failed')
    this.ctx.logger.warn(error)
  }

  /** Assign one authoritative state, then notify non-vetoing observers. */
  private commit<T extends BrowserRuntimeState>(state: T): T {
    const committed = Object.freeze(state) as T
    this.state = committed
    this.notifyState(committed)
    return committed
  }

  /** Resolve and validate the addressed state. */
  private addressed(target: BrowserTarget): BrowserRuntimeState {
    if (this.state === undefined || !sameTarget(this.state.target, target)) {
      throw new BrowserRuntimeError('browser target is not present', 'BROWSER_NOT_FOUND')
    }
    return this.state
  }

  /** Resolve an open page or reject a closed target. */
  private open(target: BrowserTarget): BrowserPageState {
    const state = this.addressed(target)
    if (state.status !== 'open') {
      throw new BrowserRuntimeError('browser target is closed', 'BROWSER_NOT_OPEN')
    }
    return state
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
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
      if (this.state !== undefined) {
        throw new BrowserRuntimeError(
          'the deterministic browser runtime has already created its temporary Profile',
          'BROWSER_CAPACITY',
        )
      }
      return this.commit({
        status: 'open',
        target: this.target,
        revision: 0,
        url: 'about:blank',
        title: 'New Tab',
        text: '',
        focused: false,
      })
    })
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserPageState> {
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      const page = this.pages.get(request.url)
      if (page === undefined) {
        throw new BrowserRuntimeError(`deterministic browser page is not configured: ${request.url}`, 'BROWSER_UNKNOWN_URL')
      }
      return this.commit({
        status: 'open',
        target: state.target,
        revision: state.revision + 1,
        url: page.url,
        title: page.title,
        text: page.text,
        focused: state.focused,
      })
    })
  }

  async observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState> {
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
      return this.addressed(request.target)
    })
  }

  async screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot> {
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
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
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      return this.commit({ ...state, revision: state.revision + 1, focused: true })
    })
  }

  async close(request: BrowserMutationRequest): Promise<BrowserClosedState> {
    assertNotAborted(request.signal)
    return this.exclusive(() => {
      assertNotAborted(request.signal)
      const state = this.open(request.target)
      this.expected(state, request.expectedRevision)
      return this.commit({ status: 'closed', target: state.target, revision: state.revision + 1 })
    })
  }

  /** Finish accepted operations, close the temporary Profile, then make the Provider unusable. */
  private async teardown(): Promise<void> {
    this.closing = true
    await this.queue
    if (this.state?.status === 'open') {
      this.commit({ status: 'closed', target: this.state.target, revision: this.state.revision + 1 })
    }
    this.disposed = true
  }
}

export default DeterministicBrowserRuntime
