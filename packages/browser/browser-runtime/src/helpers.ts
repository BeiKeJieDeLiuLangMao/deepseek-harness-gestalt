/** Shared Provider helpers for the Browser Runtime capability. @module @deepseek-ai/dsh-browser-runtime */
import type { Context } from '@deepseek-ai/cordis'
import { BrowserRuntimeError } from './types.ts'
import type { BrowserPageState, BrowserRuntimeState, BrowserTarget } from './types.ts'

/**
 * Compare all four opaque identities without exposing Provider structure.
 * @param left - First target.
 * @param right - Second target.
 * @returns whether both values address the same Profile, Workspace, browser, and tab.
 */
export function sameBrowserTarget(left: BrowserTarget, right: BrowserTarget): boolean {
  return left.profileId === right.profileId
    && left.workspaceId === right.workspaceId
    && left.browserId === right.browserId
    && left.tabId === right.tabId
}

/**
 * Reject already-aborted work before it reaches Provider state.
 * @param signal - Caller cancellation, if any.
 */
export function assertBrowserNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new BrowserRuntimeError(`browser operation aborted: ${String(signal.reason)}`, 'BROWSER_ABORTED')
  }
}

/**
 * Serialize one accepted operation behind earlier queued work.
 * @param queue - Tail of the Provider's operation queue.
 * @param assertAccepting - Throws `BROWSER_DISPOSED` after teardown begins.
 * @param operation - Work to run after earlier operations settle.
 * @returns the operation promise and the next queue tail.
 */
export function enqueueBrowserRuntimeOperation<T>(
  queue: Promise<void>,
  assertAccepting: () => void,
  operation: () => T | Promise<T>,
): { readonly result: Promise<T>; readonly queue: Promise<void> } {
  assertAccepting()
  const result = queue.then(operation)
  return {
    result,
    queue: result.then(() => undefined, () => undefined),
  }
}

/**
 * Publish one committed state while containing every post-commit observer failure.
 * @param ctx - Host context whose `browser/runtime-state` listeners receive the state.
 * @param state - Frozen committed state.
 * @param warn - Logs one contained observer failure.
 */
export function emitBrowserRuntimeState(
  ctx: Context,
  state: BrowserRuntimeState,
  warn: (error: unknown) => void,
): void {
  const args = ['browser/runtime-state', state]
  for (const listener of ctx.events.dispatch('emit', args) as Array<(value: BrowserRuntimeState) => unknown>) {
    try {
      const returned = listener(state)
      if (returned != null && typeof (returned as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(returned as PromiseLike<unknown>).then(undefined, warn)
      }
    } catch (error) {
      warn(error)
    }
  }
}

/**
 * Resolve the addressed Provider state or reject an unknown target.
 * @param state - Current Provider state, if any.
 * @param target - Opaque identities from the caller.
 * @returns the current state when it addresses `target`.
 */
export function addressedBrowserRuntimeState(
  state: BrowserRuntimeState | undefined,
  target: BrowserTarget,
): BrowserRuntimeState {
  if (state === undefined || !sameBrowserTarget(state.target, target)) {
    throw new BrowserRuntimeError('browser target is not present', 'BROWSER_NOT_FOUND')
  }
  return state
}

/**
 * Narrow one addressed state to an open page.
 * @param state - Current addressed state.
 * @returns the open page when `status` is `open`.
 */
export function requireOpenBrowserPage(state: BrowserRuntimeState): BrowserPageState {
  if (state.status !== 'open') {
    throw new BrowserRuntimeError('browser target is closed', 'BROWSER_NOT_OPEN')
  }
  return state
}
