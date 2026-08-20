/** Shared get/subscribe/set hub for Desktop renderer snapshots. */

/**
 * Create a snapshot hub that notifies subscribers and isolates listener throws.
 * @param initial - first snapshot before any Host push.
 * @param onListenerError - reports one failing subscriber without skipping later subscribers.
 * @returns get/subscribe/set hub.
 */
export function createSnapshotHub<T>(
  initial: T,
  onListenerError: (error: unknown) => void,
): {
  readonly getSnapshot: () => T
  readonly subscribe: (listener: () => void) => () => void
  readonly set: (snapshot: T) => void
} {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      snapshot = next
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch (error) {
          onListenerError(error)
        }
      }
    },
  }
}
