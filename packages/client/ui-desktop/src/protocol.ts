/**
 * Desktop Host bridge: preload `contextBridge` surface and updater phases.
 * The page never imports Electron; it only reads `window.dshDesktop`.
 * @module @deepseek-ai/dsh-client-ui-desktop/protocol
 */

import type {
  PairingChallengeId,
  PendingPairingId,
  PersonalPairingId,
} from '@deepseek-ai/dsh-remote-access'

/** IPC / preload channel for the current updater snapshot. */
export const UPDATER_GET_STATUS = 'updater:getStatus'
/** IPC / preload channel: start a check. */
export const UPDATER_CHECK_NOW = 'updater:checkNow'
/** IPC / preload channel: start a download after the user confirms. */
export const UPDATER_DOWNLOAD_NOW = 'updater:downloadNow'
/** IPC / preload channel: quit and install a downloaded bundle. */
export const UPDATER_QUIT_AND_INSTALL = 'updater:quitAndInstall'
/** IPC event the Desktop Host pushes on every phase change. */
export const UPDATER_STATUS_CHANGED = 'updater:status-changed'
/** IPC / preload channel: minimize the window. */
export const WINDOW_MINIMIZE = 'window:minimize'
/** IPC / preload channel: toggle maximize. */
export const WINDOW_MAXIMIZE = 'window:maximize'
/** IPC / preload channel: close the window. */
export const WINDOW_CLOSE = 'window:close'
/** IPC / preload channel for the current installation Account snapshot. */
export const ACCOUNT_GET_SNAPSHOT = 'account:getSnapshot'
/** IPC / preload channel accepting the bilingual privacy notice. */
export const ACCOUNT_ACCEPT_PRIVACY = 'account:acceptPrivacy'
/** IPC / preload channel starting GitHub authorization in the system browser. */
export const ACCOUNT_BEGIN_LOGIN = 'account:beginLogin'
/** IPC / preload channel revoking the current installation Account Session. */
export const ACCOUNT_SIGN_OUT = 'account:signOut'
/** IPC event pushed for every current-installation Account transition. */
export const ACCOUNT_SNAPSHOT_CHANGED = 'account:snapshot-changed'
/** IPC / preload channel for Mobile Access and Personal Pairing state. */
export const PAIRING_GET_SNAPSHOT = 'pairing:getSnapshot'
/** IPC / preload channel changing Settings-owned Mobile Access. */
export const PAIRING_SET_ENABLED = 'pairing:setEnabled'
/** IPC / preload channel creating one high-entropy invitation. */
export const PAIRING_CREATE_CHALLENGE = 'pairing:createChallenge'
/** IPC / preload channel cancelling the current invitation. */
export const PAIRING_CANCEL_CHALLENGE = 'pairing:cancelChallenge'
/** IPC / preload channel confirming matching authentication words. */
export const PAIRING_CONFIRM = 'pairing:confirm'
/** IPC / preload channel rejecting a pending handshake. */
export const PAIRING_REJECT = 'pairing:reject'
/** IPC event pushed for every Mobile Access or pairing transition. */
export const PAIRING_SNAPSHOT_CHANGED = 'pairing:snapshot-changed'

/** Updater lifecycle the Update Control renders. */
export type UpdaterPhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

/** Immutable updater snapshot pushed to the page. */
export interface UpdaterStatus {
  /** Current phase. */
  readonly state: UpdaterPhase
  /** Epoch ms of the last completed check, or null. */
  readonly lastCheckedAt: number | null
  /** Version string when a newer Desktop Bundle exists. */
  readonly newVersion?: string
  /** 0–100 while downloading. */
  readonly downloadPercent?: number
  /** Human-readable failure when state is error. */
  readonly errorMessage?: string
}

/** Public Account fields shown on Desktop after Platform confirms the session. */
export interface DesktopPlatformAccount {
  readonly id: string
  readonly githubId: number
  readonly githubLogin: string
  readonly avatarUrl: string
}

/** Desktop Host-owned current-installation Account lifecycle. */
export interface DesktopAccountSnapshot {
  readonly status: 'unavailable' | 'idle' | 'authorizing' | 'polling' | 'signed-in' | 'signing-out' | 'failed'
  readonly privacyAccepted: boolean
  readonly account?: DesktopPlatformAccount
  readonly error?: string
}

/** High-entropy invitation shown as both QR and a complete one-time link. */
export interface DesktopPairingChallenge {
  readonly id: PairingChallengeId
  readonly expiresAt: number
  readonly oneTimeLink: string
  readonly qrPayload: string
}

/** Same-account handshake awaiting explicit Desktop confirmation. */
export interface DesktopPendingPairing {
  readonly id: PendingPairingId
  readonly deviceName: string
  readonly authenticationWords: readonly [string, string, string, string, string, string]
}

/** Confirmed Companion-only device listed in Mobile Pairing Settings. */
export interface DesktopPersonalPairing {
  readonly id: PersonalPairingId
  readonly deviceName: string
  readonly platform: 'ios' | 'android'
  readonly pairedAt: number
}

/** Desktop Host-owned Mobile Access and Personal Pairing lifecycle. */
export interface DesktopPairingSnapshot {
  readonly status: 'unavailable' | 'ready' | 'challenge' | 'pending' | 'failed'
  readonly enabled: boolean
  readonly challenge?: DesktopPairingChallenge
  readonly pending?: DesktopPendingPairing
  readonly pairings: readonly DesktopPersonalPairing[]
  readonly error?: string
}

/** Preload API exposed as `window.dshDesktop`. Absent in browser `dsh web`. */
export interface DesktopBridge {
  /** Node `process.platform` of the Desktop Host. */
  readonly platform: string
  /** Current updater snapshot. */
  readonly getStatus: () => Promise<UpdaterStatus>
  /** Ask Desktop Host to check the GitHub feed. */
  readonly checkNow: () => void
  /** Ask Desktop Host to download after the user confirms. */
  readonly downloadNow: () => void
  /** Ask Desktop Host to quit and install. */
  readonly quitAndInstall: () => void
  /**
   * Subscribe to updater snapshots.
   * @param listener - called on every phase change.
   * @returns unsubscribe.
   */
  readonly onStatus: (listener: (status: UpdaterStatus) => void) => () => void
  /** Minimize the Desktop Host window. */
  readonly windowMinimize: () => void
  /** Toggle maximize on the Desktop Host window. */
  readonly windowMaximize: () => void
  /** Close the Desktop Host window. */
  readonly windowClose: () => void
  /** Read the Desktop Host-owned current-installation Account state. */
  readonly accountGetSnapshot: () => Promise<DesktopAccountSnapshot>
  /** Accept the bilingual privacy notice for this application run. */
  readonly accountAcceptPrivacy: () => Promise<DesktopAccountSnapshot>
  /** Start GitHub authorization in the operating system browser. */
  readonly accountBeginLogin: () => Promise<DesktopAccountSnapshot>
  /** Revoke only this installation's Account Session. */
  readonly accountSignOut: () => Promise<DesktopAccountSnapshot>
  /** Subscribe to current-installation Account transitions. */
  readonly onAccountSnapshot: (listener: (snapshot: DesktopAccountSnapshot) => void) => () => void
  /** Read Settings-owned Mobile Access and Personal Pairing state. */
  readonly pairingGetSnapshot: () => Promise<DesktopPairingSnapshot>
  /** Enable or disable Mobile Access for this Desktop Installation. */
  readonly pairingSetEnabled: (enabled: boolean) => Promise<DesktopPairingSnapshot>
  /** Create one two-minute QR/full-link challenge. */
  readonly pairingCreateChallenge: () => Promise<DesktopPairingSnapshot>
  /** Cancel the current challenge and destroy its invitation capability. */
  readonly pairingCancelChallenge: () => Promise<DesktopPairingSnapshot>
  /** Confirm matching authentication words and activate one Device Principal. */
  readonly pairingConfirm: (pendingPairingId: PendingPairingId) => Promise<DesktopPairingSnapshot>
  /** Reject a pending handshake and destroy its pending key. */
  readonly pairingReject: (pendingPairingId: PendingPairingId) => Promise<DesktopPairingSnapshot>
  /** Subscribe to Mobile Access and Personal Pairing transitions. */
  readonly onPairingSnapshot: (listener: (snapshot: DesktopPairingSnapshot) => void) => () => void
}

declare global {
  interface Window {
    /** Desktop Host bridge; missing in browser `dsh web`. */
    dshDesktop?: DesktopBridge
  }
}
