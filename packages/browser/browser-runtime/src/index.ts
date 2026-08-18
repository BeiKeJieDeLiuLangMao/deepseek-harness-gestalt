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
     * A Browser Runtime Provider committed a new lifecycle state.
     * @mode emit
     * @param state - Complete committed state after the operation.
     */
    'browser/runtime-state'(state: BrowserRuntimeState): void
  }
}

/**
 * Browser Runtime Service Definition. Providers serialize mutations and reject a stale
 * `expectedRevision`; Consumers can therefore coordinate Agent and human operations
 * without relying on last-writer-wins state.
 */
export abstract class BrowserRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'browserRuntime')
  }

  /**
   * Create one temporary Profile, Workspace, browser instance, and tab.
   * @param request - Temporary-profile request and cancellation signal.
   * @returns initial open page state at revision zero.
   */
  abstract create(request: BrowserCreateRequest): Promise<BrowserPageState>
  /**
   * Navigate the addressed tab after checking its expected revision.
   * @param request - Target, expected revision, URL, and cancellation signal.
   * @returns committed open page state.
   */
  abstract navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>
  /**
   * Observe the latest open or closed state for one target.
   * @param request - Target and cancellation signal.
   * @returns current state without changing its revision.
   */
  abstract observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState>
  /**
   * Capture deterministic PNG bytes for the addressed open tab.
   * @param request - Target and cancellation signal.
   * @returns screenshot bytes and depicted page facts at the current revision.
   */
  abstract screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot>
  /**
   * Focus the addressed tab after checking its expected revision.
   * @param request - Target, expected revision, and cancellation signal.
   * @returns committed focused page state.
   */
  abstract focus(request: BrowserMutationRequest): Promise<BrowserPageState>
  /**
   * Close the addressed tab and its temporary Profile after checking its expected revision.
   * @param request - Target, expected revision, and cancellation signal.
   * @returns terminal close receipt.
   */
  abstract close(request: BrowserMutationRequest): Promise<BrowserClosedState>
}

export default BrowserRuntime
