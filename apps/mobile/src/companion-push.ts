/** Content-free Companion push and foreground deep-link routing. */

const COMPANION_PUSH_CATEGORIES = [
  'approval', 'question', 'turn-complete', 'failure',
] as const

export type CompanionPushCategory = (typeof COMPANION_PUSH_CATEGORIES)[number]

export interface CompanionPushHint {
  category: CompanionPushCategory
  route: string
}

export interface CompanionPushState {
  token: string | undefined
  foreground: boolean
  socketOpen: boolean
  synchronized: boolean
}

/**
 * Build a generic APNs/FCM hint. Streaming chunks never emit a payload.
 * @param event - Desktop-confirmed event.
 */
export function companionPushHint(
  event: { kind: CompanionPushCategory | 'streaming'; route: string },
): CompanionPushHint | undefined {
  if (event.kind === 'streaming') return undefined
  return { category: event.kind, route: event.route }
}

/**
 * Apply a tap only after the app is foregrounded and synchronized.
 * @param state - current Mobile process state.
 * @param hint - tapped generic hint.
 */
export function openCompanionDeepLink(
  state: CompanionPushState,
  hint: CompanionPushHint,
): { action: 'sync-first' | 'open'; route: string } {
  if (!state.foreground || !state.synchronized) return { action: 'sync-first', route: hint.route }
  return { action: 'open', route: hint.route }
}

/**
 * Pause WSS in background; reconnect only in foreground.
 * @param state - current process state.
 * @param foreground - next visibility.
 */
export function setCompanionForeground(
  state: CompanionPushState,
  foreground: boolean,
): CompanionPushState {
  return {
    ...state,
    foreground,
    socketOpen: foreground,
    synchronized: foreground ? false : state.synchronized,
  }
}

/**
 * Drop the matching push token on unpair or revocation.
 * @param state - current process state.
 */
export function clearCompanionPushToken(state: CompanionPushState): CompanionPushState {
  return { ...state, token: undefined }
}
