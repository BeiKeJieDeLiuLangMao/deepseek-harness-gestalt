/** Content-free Companion push routing and foreground-only deep-link presentation. */

import {
  companionPushHintForEvent,
  parseRelayRouteId,
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

/**
 * Build a generic APNs/FCM hint. Streaming chunks never emit a payload.
 * @param event - Desktop-confirmed event.
 * @returns the content-free hint, or `undefined` for streaming.
 */
export function companionPushHint(
  event: { kind: CompanionPushCategory | 'streaming'; route: string; sessionRef?: string },
): CompanionPushHint | undefined {
  return companionPushHintForEvent({
    kind: event.kind,
    routeId: parseRelayRouteId(event.route),
    ...(event.sessionRef === undefined ? {} : { sessionRef: event.sessionRef }),
  })
}

/**
 * Pause WSS in background; reconnect only in foreground, then require a fresh sync.
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
  return { ...state, foreground: true, socketOpen: true, synchronized: false }
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
  if (!state.foreground) {
    return { phase: 'foreground', settle: false, routeId: hint.routeId, chrome }
  }
  if (!state.socketOpen) {
    return { phase: 'reconnect', settle: false, routeId: hint.routeId, chrome }
  }
  if (!state.synchronized) {
    return { phase: 'synchronize', settle: false, routeId: hint.routeId, chrome }
  }
  return { phase: 'present', settle: false, routeId: hint.routeId, chrome }
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
