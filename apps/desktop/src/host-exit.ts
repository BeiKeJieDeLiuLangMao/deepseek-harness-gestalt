/**
 * Decide what Desktop Host does when the Web Host child exits.
 * @module @deepseek-ai/dsh-desktop/host-exit
 */

/** Next action after a Web Host exit. */
export type HostExitPlan = 'ignore' | 'respawn' | 'error'

/**
 * Plan the next action after the Web Host process exits.
 * @param windowAlive - the BrowserWindow still exists.
 * @param alreadyRespawned - a respawn already ran in this Desktop Host process.
 * @returns ignore if the window is gone; one respawn; then an error page.
 */
export function planHostExit(windowAlive: boolean, alreadyRespawned: boolean): HostExitPlan {
  if (!windowAlive) return 'ignore'
  if (!alreadyRespawned) return 'respawn'
  return 'error'
}
