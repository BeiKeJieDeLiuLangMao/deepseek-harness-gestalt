/** Observable Desktop Account snapshot for the Mobile Pairing Settings section. */

import type { DesktopAccountSnapshot, DesktopBridge } from '../protocol.ts'

/** Renderer-side Account source. */
export interface DesktopAccountSource {
  readonly getSnapshot: () => DesktopAccountSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly set: (snapshot: DesktopAccountSnapshot) => void
}

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
  let snapshot = INITIAL_ACCOUNT_SNAPSHOT
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      snapshot = next
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
  let active = true
  let pushSeen = false
  const unsubscribe = desktop.onAccountSnapshot((snapshot) => {
    if (!active) return
    pushSeen = true
    source.set(snapshot)
  })
  void desktop.accountGetSnapshot().then((snapshot) => {
    if (active && !pushSeen) source.set(snapshot)
  }).catch((error: unknown) => {
    if (active) onError(error)
  })
  return () => {
    active = false
    unsubscribe()
  }
}
