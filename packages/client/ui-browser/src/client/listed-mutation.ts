/**
 * Recover a Dock or preview mutation that used a stale listing revision.
 * @module @deepseek-ai/dsh-client-ui-browser/client/listed-mutation
 */

import type { BrowserRuntimeState, BrowserTarget } from '@deepseek-ai/dsh-browser-workspace/client'

const REVISION_CONFLICT = /BROWSER_REVISION_CONFLICT|revision conflict/i

/**
 * True when a listed-tab mutation failed because `expectedRevision` was stale.
 * Gateway folds `BrowserRuntimeError` into `internal` and keeps this wording
 * on `message`; same-process callers may still carry the stable code.
 * @param error - Rejection from focus, close, or another listed mutation.
 * @returns whether observe-once then retry may recover the call.
 */
export function isBrowserRevisionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && error.code === 'BROWSER_REVISION_CONFLICT') return true
  return error instanceof Error && REVISION_CONFLICT.test(error.message)
}

/**
 * Run one listed-tab mutation and recover a single revision conflict.
 * @param mutate - Focus or close using the caller-supplied revision.
 * @param observe - Session-bound observe; a closed result forgets the listing row.
 * @param target - Addressed tab.
 * @param listedRevision - Revision from the Workspace listing row.
 * @returns the mutation result, or `undefined` when observe reports closed.
 */
export async function recoverListedMutation<T>(
  mutate: (target: BrowserTarget, expectedRevision: number) => Promise<T>,
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>,
  target: BrowserTarget,
  listedRevision: number,
): Promise<T | undefined> {
  try {
    return await mutate(target, listedRevision)
  } catch (error) {
    if (!isBrowserRevisionConflict(error)) throw error
    const state = await observe(target)
    if (state.status === 'closed') return undefined
    return await mutate(target, state.revision)
  }
}
