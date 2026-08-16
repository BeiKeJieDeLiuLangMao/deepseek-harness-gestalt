/** Observable updater snapshot for the inject `hooks` compartment. */
import type { UpdaterStatus } from '../protocol.ts'

/** Default snapshot before the Desktop Host pushes a status. */
export const INITIAL_UPDATER_STATUS: UpdaterStatus = Object.freeze({
  state: 'idle',
  lastCheckedAt: null,
})

/**
 * Create a status source the renderer binds as `useUpdater`.
 * @returns getSnapshot / subscribe / set.
 */
export function createUpdaterSource(): {
  getSnapshot: () => UpdaterStatus
  subscribe: (listener: () => void) => () => void
  set: (status: UpdaterStatus) => void
} {
  let snapshot: UpdaterStatus = INITIAL_UPDATER_STATUS
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (status) => {
      snapshot = status
      for (const listener of listeners) listener()
    },
  }
}
