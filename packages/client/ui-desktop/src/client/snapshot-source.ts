/**
 * Mutable snapshot plus subscriber fan-out for Desktop Host pushes.
 * Account and pairing sources share this ledger so a late read cannot race
 * a push and one failing listener cannot skip the rest.
 */

import { createSnapshotHub } from './snapshot-hub.ts'

/** Renderer-side snapshot source consumed through a slot hook compartment. */
export interface DesktopSnapshotSource<T> {
  readonly getSnapshot: () => T
  readonly subscribe: (listener: () => void) => () => void
  readonly set: (snapshot: T) => void
}

/**
 * Create a mutable snapshot source.
 * @param initial - value before the Desktop Host answers.
 * @param onListenerError - reports one subscriber exception without skipping later subscribers.
 * @returns the source the composition owns.
 */
export function createDesktopSnapshotSource<T>(
  initial: T,
  onListenerError: (error: unknown) => void,
): DesktopSnapshotSource<T> {
  return createSnapshotHub(initial, onListenerError)
}

/**
 * Bind a Host read and push so a late initial read cannot overwrite a newer push.
 * @param source - renderer snapshot source to update.
 * @param subscribe - Host push subscription that returns its disposer.
 * @param read - Host snapshot read that may settle after a push.
 * @param onError - reports failure of the initial Host read while the bind is active.
 * @returns disposer that blocks later writes and unsubscribes the Host push.
 */
export function bindDesktopSnapshot<T>(
  source: Pick<DesktopSnapshotSource<T>, 'set'>,
  subscribe: (listener: (snapshot: T) => void) => () => void,
  read: () => Promise<T>,
  onError: (error: unknown) => void,
): () => void {
  let active = true
  let pushSeen = false
  const unsubscribe = subscribe((snapshot) => {
    if (!active) return
    pushSeen = true
    source.set(snapshot)
  })
  void read().then((snapshot) => {
    if (active && !pushSeen) source.set(snapshot)
  }).catch((error: unknown) => {
    if (active) onError(error)
  })
  return () => {
    active = false
    unsubscribe()
  }
}
