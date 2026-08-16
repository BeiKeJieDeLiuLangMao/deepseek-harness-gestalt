/** Observable updater snapshot for the inject `hooks` compartment. */
import type { DesktopBridge, UpdaterStatus } from '../protocol.ts'

/** Minimal updater source consumed by the Session Surface. */
export interface UpdaterSource {
  readonly getSnapshot: () => UpdaterStatus
  readonly subscribe: (listener: () => void) => () => void
  readonly set: (status: UpdaterStatus) => void
}

/** Default snapshot before the Desktop Host pushes a status. */
export const INITIAL_UPDATER_STATUS: UpdaterStatus = Object.freeze({
  state: 'idle',
  lastCheckedAt: null,
})

/**
 * Create a status source the renderer binds as `useUpdater`.
 * @param onListenerError - subscriber failure reporter.
 * @returns getSnapshot / subscribe / set.
 */
export function createUpdaterSource(
  onListenerError: (error: unknown) => void = (error) => { console.error('updater subscriber failed', error) },
): UpdaterSource {
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
      for (const listener of listeners) {
        try {
          listener()
        } catch (error) {
          onListenerError(error)
        }
      }
    },
  }
}

/**
 * Bind the Desktop bridge without letting an initial read overwrite a newer push.
 * @param source - renderer updater source.
 * @param desktop - preload bridge.
 * @param onError - initial read failure reporter.
 * @returns disposer that blocks all later writes.
 */
export function bindDesktopUpdater(
  source: UpdaterSource,
  desktop: Pick<DesktopBridge, 'getStatus' | 'onStatus'>,
  onError: (error: unknown) => void = (error) => { console.error('failed to read updater status', error) },
): () => void {
  let active = true
  let pushSeen = false
  const unsubscribe = desktop.onStatus((status) => {
    if (!active) return
    pushSeen = true
    source.set(status)
  })
  void desktop.getStatus().then((status) => {
    if (active && !pushSeen) source.set(status)
  }).catch((error: unknown) => {
    if (active) onError(error)
  })
  return () => {
    active = false
    unsubscribe()
  }
}
