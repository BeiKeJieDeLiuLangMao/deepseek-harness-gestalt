/** Observable built-in account-pool snapshot for Settings. */
import type { DesktopAccountPoolSnapshot, DesktopBridge } from '../protocol.ts'
import {
  bindDesktopSnapshot,
  createDesktopSnapshotSource,
  type DesktopSnapshotSource,
} from './snapshot-source.ts'

export type DesktopAccountPoolSource = DesktopSnapshotSource<DesktopAccountPoolSnapshot>

export const INITIAL_ACCOUNT_POOL_SNAPSHOT: DesktopAccountPoolSnapshot = Object.freeze({
  state: 'starting',
  accounts: [],
})

export function createDesktopAccountPoolSource(
  onListenerError: (error: unknown) => void = (error) => {
    console.error('account-pool subscriber failed', error)
  },
): DesktopAccountPoolSource {
  return createDesktopSnapshotSource(INITIAL_ACCOUNT_POOL_SNAPSHOT, onListenerError)
}

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
