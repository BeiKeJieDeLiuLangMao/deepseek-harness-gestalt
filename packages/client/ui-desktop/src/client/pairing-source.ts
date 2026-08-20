/** Observable Personal Pairing snapshot for Desktop Settings. */

import type { DesktopBridge, DesktopPairingSnapshot } from '../protocol.ts'
import {
  bindDesktopSnapshot,
  createDesktopSnapshotSource,
  type DesktopSnapshotSource,
} from './snapshot-source.ts'

/** Renderer-side Personal Pairing source. */
export type DesktopPairingSource = DesktopSnapshotSource<DesktopPairingSnapshot>

/** Initial disabled state before the Desktop Host answers. */
export const INITIAL_PAIRING_SNAPSHOT: DesktopPairingSnapshot = Object.freeze({
  status: 'unavailable', enabled: false, pairings: [],
})

/**
 * Create the source consumed through the Settings slot hook compartment.
 * @param onListenerError - reports one failing subscriber without skipping later subscribers.
 * @returns mutable snapshot source owned by the Desktop UI composition.
 */
export function createDesktopPairingSource(
  onListenerError: (error: unknown) => void = (error) => {
    console.error('pairing subscriber failed', error)
  },
): DesktopPairingSource {
  return createDesktopSnapshotSource(INITIAL_PAIRING_SNAPSHOT, onListenerError)
}

/**
 * Bind Host reads and pushes without allowing a late initial read to win.
 * @param source - renderer snapshot source to update.
 * @param desktop - preload pairing read and subscription methods.
 * @param onError - reports failure of the initial Host read.
 * @returns disposer for the Host snapshot subscription.
 */
export function bindDesktopPairing(
  source: DesktopPairingSource,
  desktop: Pick<DesktopBridge, 'pairingGetSnapshot' | 'onPairingSnapshot'>,
  onError: (error: unknown) => void = (error) => {
    console.error('failed to read pairing status', error)
  },
): () => void {
  return bindDesktopSnapshot(
    source,
    listener => desktop.onPairingSnapshot(listener),
    () => desktop.pairingGetSnapshot(),
    onError,
  )
}
