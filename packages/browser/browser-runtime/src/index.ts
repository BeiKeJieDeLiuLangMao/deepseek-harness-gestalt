/** Provider-neutral Service Definition for the Browser Runtime capability. @module @deepseek-ai/dsh-browser-runtime */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  BrowserClosedState,
  BrowserCreateRequest,
  BrowserMutationRequest,
  BrowserNavigateRequest,
  BrowserObserveRequest,
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
} from './types.ts'

export {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserRuntimeError,
  BrowserTabId,
  BrowserWorkspaceId,
} from './types.ts'
export type {
  BrowserClosedState,
  BrowserCreateRequest,
  BrowserMutationRequest,
  BrowserNavigateRequest,
  BrowserObserveRequest,
  BrowserPageState,
  BrowserRuntimeErrorCode,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    browserRuntime: BrowserRuntime
  }

  interface Events {
    /**
     * Post-commit Browser Runtime lifecycle notification. Providers contain synchronous throws and
     * asynchronous rejections from each listener, continue the fan-out, and never change a committed
     * operation's outcome; returned promises are observed but not awaited.
     * @mode emit
     * @param state - Complete committed state after the operation.
     */
    'browser/runtime-state'(state: BrowserRuntimeState): void
  }
}

/**
 * Browser Runtime Service Definition. Providers serialize every operation, own target lifecycles,
 * and reject stale mutations. Callers retain returned targets and revisions but do not dispose
 * Provider resources directly. A method resolves only after its state commit and synchronous
 * post-commit notification attempts; asynchronous observers are not awaited.
 */
export abstract class BrowserRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'browserRuntime')
  }

  /**
   * Create one temporary Profile, Workspace, browser instance, and tab.
   * @param request - Temporary-profile request and cancellation signal.
   * @returns initial open page state at revision zero; its target addresses every later operation in
   * this lifecycle.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED` when cancellation wins, `BROWSER_CAPACITY`
   * when this Provider cannot admit another lifecycle, or `BROWSER_DISPOSED` after teardown starts.
   */
  abstract create(request: BrowserCreateRequest): Promise<BrowserPageState>
  /**
   * Navigate the addressed tab after checking its expected revision.
   * @param request - Target, expected revision, URL, and cancellation signal.
   * @returns committed open page state whose revision replaces the caller's prior revision.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
   * `BROWSER_NOT_OPEN`, `BROWSER_REVISION_CONFLICT`, or `BROWSER_UNKNOWN_URL` when the corresponding
   * precondition fails before commit.
   */
  abstract navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>
  /**
   * Observe the latest open or closed state for one target.
   * @param request - Target and cancellation signal.
   * @returns current state after earlier queued operations, without changing its revision.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, or
   * `BROWSER_NOT_FOUND`; a closed target is returned rather than rejected.
   */
  abstract observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState>
  /**
   * Capture PNG bytes for the addressed open tab.
   * @param request - Target and cancellation signal.
   * @returns screenshot bytes and depicted page facts from one serialized read at the current revision.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
   * `BROWSER_NOT_OPEN`, or `BROWSER_UNKNOWN_URL` when the Provider cannot depict the addressed open
   * page.
   */
  abstract screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot>
  /**
   * Focus the addressed tab after checking its expected revision.
   * @param request - Target, expected revision, and cancellation signal.
   * @returns committed focused page state whose revision replaces the caller's prior revision.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
   * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
   * before commit.
   */
  abstract focus(request: BrowserMutationRequest): Promise<BrowserPageState>
  /**
   * Close the addressed tab and its temporary Profile after checking its expected revision.
   * @param request - Target, expected revision, and cancellation signal.
   * @returns terminal close receipt retained by the Provider for later observation.
   * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
   * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
   * before commit.
   */
  abstract close(request: BrowserMutationRequest): Promise<BrowserClosedState>
}

export default BrowserRuntime
