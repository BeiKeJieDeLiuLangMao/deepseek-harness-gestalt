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
