/** Content-free Companion foreground state and notification deep-link presentation. */

import { registerPlugin } from '@capacitor/core'
import {
  parseCompanionPushHint,
  type CompanionPushCategory,
  type CompanionPushHint,
} from '@deepseek-ai/dsh-remote-protocol'

export type { CompanionPushCategory, CompanionPushHint }

/** Process visibility and synchronization required before any Companion mutation. */
export interface CompanionPushState {
  token: string | undefined
  foreground: boolean
  socketOpen: boolean
  synchronized: boolean
}

/** Notification chrome that may accompany a tap; it never settles an interaction. */
export type CompanionNotificationChrome = 'open' | 'approve' | 'answer'

/** Ordered work a tap must finish before the current interaction is shown. */
export type CompanionDeepLinkPhase = 'foreground' | 'reconnect' | 'synchronize' | 'present'

/** Relay lifecycle the foreground runtime actually starts and stops. */
export interface CompanionRelayLifecycle {
  start(): Promise<void>
  stop(): Promise<void>
  isConnected(): boolean
}

interface CapacitorAppPlugin {
  addListener(
    eventName: 'appStateChange',
    listenerFunc: (state: { isActive: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>
}

let installed: CompanionForegroundRuntime | undefined

/**
 * Pause WSS in background. Foreground never fabricates a live socket.
 * @param state - current process state.
 * @param foreground - next visibility.
 * @returns updated process state; background never keeps a socket or mutation right.
 */
export function setCompanionForeground(
  state: CompanionPushState,
  foreground: boolean,
): CompanionPushState {
  if (!foreground) {
    return { ...state, foreground: false, socketOpen: false, synchronized: false }
  }
  return { ...state, foreground: true, socketOpen: false, synchronized: false }
}

/**
 * Record that the real Relay lifecycle acknowledged an attachment after foreground start.
 * @param state - current process state.
 * @returns state with a live socket only while already foregrounded.
 */
export function markCompanionSocketOpen(state: CompanionPushState): CompanionPushState {
  if (!state.foreground) return { ...state, socketOpen: false, synchronized: false }
  return { ...state, socketOpen: true, synchronized: false }
}

/**
 * Record that Desktop-authoritative synchronization finished after foreground reconnect.
 * @param state - current process state.
 * @returns state that may present an interaction when already foregrounded and attached.
 */
export function markCompanionSynchronized(state: CompanionPushState): CompanionPushState {
  if (!state.foreground || !state.socketOpen) return { ...state, synchronized: false }
  return { ...state, synchronized: true }
}

/**
 * Resolve a notification tap. The application must foreground, reconnect, and
 * synchronize before presenting the current interaction. Notification chrome
 * never settles an approval or human question.
 * @param state - current Mobile process state.
 * @param hint - tapped generic hint.
 * @param chrome - optional notification action label; ignored for settlement.
 * @returns the next required phase; `settle` is always false.
 */
export function openCompanionDeepLink(
  state: CompanionPushState,
  hint: CompanionPushHint,
  chrome: CompanionNotificationChrome = 'open',
): { phase: CompanionDeepLinkPhase; settle: false; routeId: string; chrome: CompanionNotificationChrome } {
  const allowlisted = parseCompanionPushHint(hint)
  if (!state.foreground) {
    return { phase: 'foreground', settle: false, routeId: allowlisted.routeId, chrome }
  }
  if (!state.socketOpen) {
    return { phase: 'reconnect', settle: false, routeId: allowlisted.routeId, chrome }
  }
  if (!state.synchronized) {
    return { phase: 'synchronize', settle: false, routeId: allowlisted.routeId, chrome }
  }
  return { phase: 'present', settle: false, routeId: allowlisted.routeId, chrome }
}

/**
 * Whether the process may submit a Companion mutation after a deep link.
 * @param state - current process state.
 * @returns true only after foreground reconnect and Desktop-authoritative sync.
 */
export function companionMayMutate(state: CompanionPushState): boolean {
  return state.foreground && state.socketOpen && state.synchronized
}

/**
 * Drop the matching push token on unpair or revocation.
 * @param state - current process state.
 */
export function clearCompanionPushToken(state: CompanionPushState): CompanionPushState {
  return { ...state, token: undefined }
}

/** Process-owned foreground, socket, token, and synchronization state. */
export class CompanionForegroundRuntime {
  private state: CompanionPushState
  private readonly relay: CompanionRelayLifecycle | undefined
  private readonly listeners = new Set<() => void>()

  /** @param options - optional real Relay lifecycle; unpaired compositions omit it. */
  constructor(options: { relay?: CompanionRelayLifecycle } = {}) {
    this.relay = options.relay
    this.state = { token: undefined, foreground: true, socketOpen: false, synchronized: false }
  }

  /**
   * @returns the current process visibility and synchronization snapshot.
   */
  getState(): CompanionPushState {
    return this.state
  }

  /**
   * Subscribe to process-state transitions.
   * @param listener - observer invoked after each published change.
   * @returns disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Apply OS visibility. Background stops the real Relay socket; foreground starts
   * it and records `socketOpen` only after `isConnected()`.
   * @param foreground - next visibility.
   */
  async setForeground(foreground: boolean): Promise<void> {
    this.state = setCompanionForeground(this.state, foreground)
    this.publish()
    if (!foreground) {
      await this.relay?.stop()
      return
    }
    if (this.relay === undefined) return
    try {
      await this.relay.start()
    } catch (error) {
      // Unconfigured Mobile Relay has no grant; visibility must not fabricate a socket.
      if (error instanceof Error && error.message === 'Mobile Relay authority is unavailable') return
      throw error
    }
    if (this.relay.isConnected()) this.state = markCompanionSocketOpen(this.state)
    this.publish()
  }

  /** Mark Desktop-authoritative synchronization after a real reconnect. */
  synchronize(): void {
    this.state = markCompanionSynchronized(this.state)
    this.publish()
  }

  /**
   * Retain the current device token until unpair.
   * @param token - opaque APNs or FCM registration token.
   */
  rememberToken(token: string): void {
    this.state = { ...this.state, token }
    this.publish()
  }

  /** Drop the local token on unpair or revocation. */
  clearToken(): void {
    this.state = clearCompanionPushToken(this.state)
    this.publish()
  }

  private publish(): void {
    const errors: unknown[] = []
    for (const listener of [...this.listeners]) {
      try { listener() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      console.error('[companion-foreground] subscriber failures:', new AggregateError(errors))
    }
  }
}

/**
 * Install the process-owned runtime used by the Mobile entry and settlement UI.
 * @param runtime - composition runtime.
 * @returns disposer that forgets only this runtime.
 */
export function installCompanionRuntime(runtime: CompanionForegroundRuntime): () => void {
  installed = runtime
  return () => { if (installed === runtime) installed = undefined }
}

/**
 * @returns the runtime installed by the Mobile entry, if any.
 */
export function companionRuntime(): CompanionForegroundRuntime | undefined {
  return installed
}

/**
 * Bind document visibility and Capacitor app state to the real Relay lifecycle.
 * @param runtime - process-owned foreground runtime.
 * @returns disposer.
 */
export function bindCompanionProcessVisibility(runtime: CompanionForegroundRuntime): () => void {
  const onVisibility = (): void => {
    void runtime.setForeground(document.visibilityState === 'visible')
  }
  const onPageHide = (): void => { void runtime.setForeground(false) }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  let removeCapacitor: (() => void) | undefined
  try {
    const App = registerPlugin<CapacitorAppPlugin>('App')
    void App.addListener('appStateChange', (state) => { void runtime.setForeground(state.isActive) })
      .then((handle) => { removeCapacitor = () => { void handle.remove() } }, () => {
        // Capacitor App plugin is absent in web and jsdom.
      })
  } catch {
    // registerPlugin throws when Capacitor native bridges are unavailable.
  }
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    removeCapacitor?.()
  }
}
