/** Observable Desktop Account snapshot for the Mobile Pairing Settings section. */

import type { DesktopAccountSnapshot, DesktopBridge } from '../protocol.ts'
import {
  bindDesktopSnapshot,
  createDesktopSnapshotSource,
  type DesktopSnapshotSource,
} from './snapshot-source.ts'

/** Renderer-side Account source. */
export type DesktopAccountSource = DesktopSnapshotSource<DesktopAccountSnapshot>

/** Initial state before the Desktop Host answers. */
export const INITIAL_ACCOUNT_SNAPSHOT: DesktopAccountSnapshot = Object.freeze({
  status: 'unavailable',
  privacyAccepted: false,
})

/**
 * Create the source consumed through the slot hook compartment.
 * @param onListenerError - reports an exception from one subscriber without skipping later subscribers.
 * @returns mutable snapshot source owned by the Desktop UI composition.
 */
export function createDesktopAccountSource(
  onListenerError: (error: unknown) => void = (error) => { console.error('account subscriber failed', error) },
): DesktopAccountSource {
  return createDesktopSnapshotSource(INITIAL_ACCOUNT_SNAPSHOT, onListenerError)
}

/**
 * Bind Host reads and pushes without allowing a late initial read to win.
 * @param source - renderer snapshot source to update.
 * @param desktop - preload Account read and subscription methods.
 * @param onError - reports failure of the initial Host read.
 * @returns disposer for the Host snapshot subscription.
 */
export function bindDesktopAccount(
  source: DesktopAccountSource,
  desktop: Pick<DesktopBridge, 'accountGetSnapshot' | 'onAccountSnapshot'>,
  onError: (error: unknown) => void = (error) => { console.error('failed to read account status', error) },
): () => void {
  return bindDesktopSnapshot(
    source,
    listener => desktop.onAccountSnapshot(listener),
    () => desktop.accountGetSnapshot(),
    onError,
  )
}
