/** Content-free Companion foreground state and notification deep-link presentation. */

import { registerPlugin } from '@capacitor/core'
import type { RelayCredentialGrant } from '@deepseek-ai/dsh-remote-access'
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
  configure?(grant?: RelayCredentialGrant): void
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
  private granted = false
  private transition: Promise<void> = Promise.resolve()
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
   * Set or drop pairing-delivered Relay authority. Clearing the grant is
   * synchronous so a later visibility `start()` cannot attach.
   * @param grant - Mobile-specific authority, or `undefined` to drop it.
   */
  configure(grant?: RelayCredentialGrant): void {
    this.granted = grant !== undefined
    this.relay?.configure?.(grant)
    if (grant === undefined) {
      this.state = { ...this.state, socketOpen: false, synchronized: false }
      this.publish()
    }
  }

  /**
   * Attach after pairing confirmation. Shares the runtime transition queue
   * with visibility so a late `stop()` cannot tear down a newer `start()`.
   */
  async start(): Promise<void> {
    await this.enqueue(() => this.startOwned())
  }

  /**
   * Stop and drain the current Mobile attachment through the shared queue.
   */
  async stop(): Promise<void> {
    await this.enqueue(() => this.stopOwned())
  }

  /**
   * Apply OS visibility. Background stops the real Relay socket; foreground
   * starts it only while a grant is present and records `socketOpen` only
   * after `isConnected()`.
   * @param foreground - next visibility.
   */
  async setForeground(foreground: boolean): Promise<void> {
    await this.enqueue(() => this.applyForeground(foreground))
  }

  /**
   * Mark Desktop-authoritative synchronization after a real reconnect.
   * The product caller is `MobileRelayEndpointLifecycle` `onCiphertext`
   * after Desktop resync ciphertext arrives.
   */
  synchronize(): void {
    if (!this.granted) return
    this.state = markCompanionSynchronized(this.state)
    this.publish()
  }

  /**
   * Drop pairing-delivered authority, reset the socket flags, and stop the
   * Relay through the shared transition queue.
   */
  async releasePairing(): Promise<void> {
    this.configure(undefined)
    await this.enqueue(() => this.stopOwned())
  }

  /**
   * Reset socket and synchronization flags without dropping the local token.
   */
  forgetConnection(): void {
    this.state = { ...this.state, socketOpen: false, synchronized: false }
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

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.transition.then(operation, operation)
    this.transition = result.then(() => undefined, () => undefined)
    return result
  }

  private async applyForeground(foreground: boolean): Promise<void> {
    this.state = setCompanionForeground(this.state, foreground)
    this.publish()
    if (!foreground) {
      await this.stopOwned()
      return
    }
    await this.startOwned()
  }

  private async startOwned(): Promise<void> {
    if (this.relay === undefined || !this.granted || !this.state.foreground) return
    await this.relay.start()
    if (!this.granted || !this.state.foreground) {
      await this.relay.stop()
      return
    }
    if (this.relay.isConnected()) {
      this.state = markCompanionSocketOpen(this.state)
      this.publish()
    }
  }

  private async stopOwned(): Promise<void> {
    await this.relay?.stop()
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
 * @param hooks - optional App-state listener factory; omitted in the product entry.
 * @returns disposer that waits for a pending Capacitor handle before `remove()`.
 */
export function bindCompanionProcessVisibility(
  runtime: CompanionForegroundRuntime,
  hooks: {
    listenAppState?: (listener: (active: boolean) => void) => Promise<{ remove: () => Promise<void> }>
  } = {},
): () => Promise<void> {
  const onVisibility = (): void => {
    void runtime.setForeground(document.visibilityState === 'visible')
  }
  const onPageHide = (): void => { void runtime.setForeground(false) }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  const pendingHandle = Promise.resolve()
    .then(() => (hooks.listenAppState ?? listenCapacitorAppState)((active) => {
      void runtime.setForeground(active)
    }))
    .then(handle => handle, () => undefined)
  return async () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    const handle = await pendingHandle
    if (handle !== undefined) await handle.remove()
  }
}

function listenCapacitorAppState(
  listener: (active: boolean) => void,
): Promise<{ remove: () => Promise<void> }> {
  const App = registerPlugin<CapacitorAppPlugin>('App')
  return App.addListener('appStateChange', (state) => { listener(state.isActive) })
}
