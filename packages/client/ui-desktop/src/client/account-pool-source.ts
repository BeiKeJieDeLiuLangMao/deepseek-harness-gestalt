/** Observable built-in account-pool snapshot for Settings. */
import type { DesktopAccountPoolSnapshot, DesktopBridge } from '../protocol.ts'
import {
  bindDesktopSnapshot,
  createDesktopSnapshotSource,
  type DesktopSnapshotSource,
} from './snapshot-source.ts'

/** Renderer snapshot source for the built-in account-pool Settings surface. */
export type DesktopAccountPoolSource = DesktopSnapshotSource<DesktopAccountPoolSnapshot>

/** Snapshot before Desktop Host answers the first account-pool read. */
export const INITIAL_ACCOUNT_POOL_SNAPSHOT: DesktopAccountPoolSnapshot = Object.freeze({
  state: 'starting',
  accounts: [],
})

/**
 * Create the account-pool snapshot source used by Settings.
 * @param onListenerError - reports one subscriber exception without skipping later subscribers.
 * @returns the source the Desktop composition owns.
 */
export function createDesktopAccountPoolSource(
  onListenerError: (error: unknown) => void = (error) => {
    console.error('account-pool subscriber failed', error)
  },
): DesktopAccountPoolSource {
  return createDesktopSnapshotSource(INITIAL_ACCOUNT_POOL_SNAPSHOT, onListenerError)
}

/**
 * Bind Host account-pool reads and pushes onto the renderer snapshot source.
 * @param source - renderer snapshot source to update.
 * @param desktop - Host snapshot read and push subscription.
 * @param onError - reports failure of the initial Host read while the bind is active.
 * @returns disposer that blocks later writes and unsubscribes the Host push.
 */
export function bindDesktopAccountPool(
  source: DesktopAccountPoolSource,
  desktop: Pick<DesktopBridge, 'accountPoolGetSnapshot' | 'onAccountPoolSnapshot'>,
  onError: (error: unknown) => void = (error) => {
    console.error('failed to read account-pool state', error)
  },
): () => void {
  return bindDesktopSnapshot(
    source,
    listener => desktop.onAccountPoolSnapshot(listener),
    () => desktop.accountPoolGetSnapshot(),
    onError,
  )
}
