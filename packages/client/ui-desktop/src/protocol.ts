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
import type { ProjectMembershipClient } from '@deepseek-ai/dsh-project-membership-client'
import type { MobileAccountInstallationView } from '@deepseek-ai/dsh-platform-account'

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
/** IPC / preload channel cancelling an in-flight GitHub authorization. */
export const ACCOUNT_CANCEL_LOGIN = 'account:cancelLogin'
/** IPC / preload channel revoking the current installation Account Session. */
export const ACCOUNT_SIGN_OUT = 'account:signOut'
/** IPC / preload channel refreshing Account-owned active Mobile Installations. */
export const ACCOUNT_REFRESH_MOBILE_INSTALLATIONS = 'account:refreshMobileInstallations'
/** IPC / preload channel remotely signing one Mobile Installation out. */
export const ACCOUNT_REVOKE_MOBILE_INSTALLATION = 'account:revokeMobileInstallation'
/** IPC event pushed for every current-installation Account transition. */
export const ACCOUNT_SNAPSHOT_CHANGED = 'account:snapshot-changed'
/** IPC / preload channel creating one Cloud Project. */
export const PROJECT_MEMBERSHIP_CREATE = 'projectMembership:create'
/** IPC / preload channel resolving the current Account's Project by Workspace remote. */
export const PROJECT_MEMBERSHIP_BY_REMOTE = 'projectMembership:byRemote'
/** IPC / preload channel reading one Project roster. */
export const PROJECT_MEMBERSHIP_ROSTER = 'projectMembership:roster'
/** IPC / preload channel inviting one public GitHub login. */
export const PROJECT_MEMBERSHIP_INVITE = 'projectMembership:invite'
/** IPC / preload channel deciding one pending invitation. */
export const PROJECT_MEMBERSHIP_DECIDE = 'projectMembership:decide'
/** IPC / preload channel retracting one issued invitation. */
export const PROJECT_MEMBERSHIP_RETRACT = 'projectMembership:retract'
/** IPC / preload channel reading invitations addressed to the current Account. */
export const PROJECT_MEMBERSHIP_PENDING = 'projectMembership:pending'
/** IPC / preload channel reading pending invitations issued from one Project. */
export const PROJECT_MEMBERSHIP_ISSUED = 'projectMembership:issued'
/** IPC / preload channel changing one member role. */
export const PROJECT_MEMBERSHIP_CHANGE_ROLE = 'projectMembership:changeRole'
/** IPC / preload channel replacing one member's function tags. */
export const PROJECT_MEMBERSHIP_SET_TAGS = 'projectMembership:setTags'
/** IPC / preload channel removing one Project member. */
export const PROJECT_MEMBERSHIP_REMOVE = 'projectMembership:remove'
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
/** IPC / preload channel revoking one confirmed pairing. */
export const PAIRING_REVOKE = 'pairing:revoke'
/** IPC event pushed for every Mobile Access or pairing transition. */
export const PAIRING_SNAPSHOT_CHANGED = 'pairing:snapshot-changed'
/** IPC / preload channel for the built-in account-pool snapshot. */
export const ACCOUNT_POOL_GET_SNAPSHOT = 'accountPool:getSnapshot'
/** IPC / preload channel refreshing the redacted roster. */
export const ACCOUNT_POOL_REFRESH = 'accountPool:refresh'
/** IPC / preload channel enabling or disabling one auth file. */
export const ACCOUNT_POOL_SET_ENABLED = 'accountPool:setEnabled'
/** IPC / preload channel deleting one auth file. */
export const ACCOUNT_POOL_DELETE = 'accountPool:delete'
/** IPC / preload channel starting a supported login. */
export const ACCOUNT_POOL_START_LOGIN = 'accountPool:startLogin'
/** IPC / preload channel polling an in-flight login. */
export const ACCOUNT_POOL_LOGIN_STATUS = 'accountPool:loginStatus'
/** IPC / preload channel cancelling an in-flight OAuth session. */
export const ACCOUNT_POOL_CANCEL_LOGIN = 'accountPool:cancelLogin'
/** IPC / preload channel submitting a GLM Coding Plan key. */
export const ACCOUNT_POOL_SUBMIT_GLM_KEY = 'accountPool:submitGlmKey'
/** IPC / preload channel refreshing one account quota observation. */
export const ACCOUNT_POOL_REFRESH_QUOTA = 'accountPool:refreshQuota'
/** IPC / preload channel refreshing quota observations for every account. */
export const ACCOUNT_POOL_REFRESH_ALL_QUOTA = 'accountPool:refreshAllQuota'
/** IPC / preload channel opening one https authorization URL in the system browser. */
export const ACCOUNT_POOL_OPEN_EXTERNAL = 'accountPool:openExternal'
/** IPC / preload channel submitting a PKCE callback URL. */
export const ACCOUNT_POOL_SUBMIT_CALLBACK = 'accountPool:submitCallback'
/** IPC / preload channel listing models for one auth file. */
export const ACCOUNT_POOL_LIST_MODELS = 'accountPool:listModels'
/** IPC / preload channel downloading one auth file through a Host save dialog. */
export const ACCOUNT_POOL_DOWNLOAD = 'accountPool:download'
/** IPC / preload channel reading redacted editable auth-file fields. */
export const ACCOUNT_POOL_READ_FIELDS = 'accountPool:readFields'
/** IPC / preload channel writing editable auth-file fields. */
export const ACCOUNT_POOL_PATCH_FIELDS = 'accountPool:patchFields'
/** IPC / preload channel dismissing an in-flight or failed login overlay. */
export const ACCOUNT_POOL_DISMISS_LOGIN = 'accountPool:dismissLogin'
/** IPC event pushed for every account-pool snapshot. */
export const ACCOUNT_POOL_SNAPSHOT_CHANGED = 'accountPool:snapshot-changed'
/** IPC / preload channel: place one official page over the sidebar viewport. */
export const BROWSER_PRESENT = 'browser:present'
/** IPC / preload channel: hide one official page when its tab is not visible. */
export const BROWSER_CONCEAL = 'browser:conceal'
/** IPC / preload channel: show Settings or the sidebar + menu in the native overlay view. */
export const CHROME_OVERLAY_SHOW = 'chrome:overlayShow'
/** IPC / preload channel: hide the native overlay view. */
export const CHROME_OVERLAY_HIDE = 'chrome:overlayHide'
/** IPC / preload channel: read the overlay request the Host last accepted. */
export const CHROME_OVERLAY_GET_STATE = 'chrome:overlayGetState'
/** IPC event the Host pushes into the overlay document. */
export const CHROME_OVERLAY_STATE = 'chrome:overlay-state'
/** IPC event the overlay document sends after select or dismiss. */
export const CHROME_OVERLAY_RESULT = 'chrome:overlay-result'
/** Query parameter that boots the Session Surface as the native overlay document. */
export const DESKTOP_OVERLAY_PARAM = 'dsh-desktop-overlay'
/** Maximum text length accepted for overlay request and selection identities. */
export const CHROME_OVERLAY_ID_MAX_LENGTH = 128

/** Official page identity sent with present and conceal. */
export interface DesktopBrowserPresentTarget {
  readonly profileId: string
  readonly workspaceId: string
  readonly browserId: string
  readonly tabId: string
}

/** Chrome viewport rectangle in CSS pixels relative to the Host content. */
export interface DesktopBrowserPresentBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Renderer request to show one official page in the sidebar viewport. */
export interface DesktopBrowserPresentRequest {
  readonly target: DesktopBrowserPresentTarget
  readonly bounds: DesktopBrowserPresentBounds
}

/** One row in a native overlay menu. Icons are tab-descriptor ids. */
export interface ChromeOverlayMenuItem {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly icon?: string
}

/** Content-relative rectangle for a native overlay menu anchor. */
export interface ChromeOverlayAnchor {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Host-chrome request that the overlay document paints. */
export type ChromeOverlayShowRequest =
  | {
    readonly kind: 'menu'
    readonly requestId: string
    readonly items: readonly ChromeOverlayMenuItem[]
    readonly anchor: ChromeOverlayAnchor
    readonly align?: 'start' | 'end'
    readonly side?: 'bottom' | 'top' | 'right'
  }
  | {
    readonly kind: 'settings'
    readonly requestId: string
    readonly sectionId?: string
  }

/** Overlay document reply after the user picks a row or dismisses. */
export type ChromeOverlayResult =
  | { readonly type: 'close'; readonly requestId: string }
  | { readonly type: 'select'; readonly requestId: string; readonly id: string }

/** Updater lifecycle the Update Control renders. */
export type UpdaterPhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'preparing'
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

/** Desktop Host-owned projection of active Mobile Account Installations. */
export interface DesktopMobileInstallationsSnapshot {
  readonly status: 'loading' | 'ready' | 'removing' | 'error'
  readonly installations: readonly MobileAccountInstallationView[]
  readonly removingInstallationId?: string
  readonly error?: string
}

/** Desktop Host-owned current-installation Account lifecycle. */
export interface DesktopAccountSnapshot {
  readonly status: 'unavailable' | 'idle' | 'authorizing' | 'polling' | 'signed-in' | 'signing-out' | 'failed'
  readonly privacyAccepted: boolean
  readonly account?: DesktopPlatformAccount
  readonly mobileInstallations?: DesktopMobileInstallationsSnapshot
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
  readonly lastAccessAt: number
  readonly online: boolean
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

/** Built-in account-pool lifecycle projected to Settings. */
export type AccountPoolPhase = 'starting' | 'ready' | 'error'

/** Supported account-pool login kinds. */
export type AccountPoolLoginKind = 'kimi' | 'xai' | 'codex' | 'anthropic' | 'antigravity' | 'glm'

/** One Host-started login, without secrets. */
export interface AccountPoolLoginStart {
  readonly kind: AccountPoolLoginKind
  readonly flow: 'device' | 'pkce' | 'glm-key'
  readonly state?: string
  readonly url?: string
  readonly userCode?: string
  readonly expiresIn?: number
  readonly error?: string
}

/** One redacted quota window for a card face. */
export interface DesktopAccountPoolQuotaWindow {
  readonly key: string
  readonly label: string
  readonly remainingPercent?: number
  readonly timeRemainingPercent?: number
  readonly periodHours?: number
  readonly resetAtMs?: number
  readonly group?: string
  readonly groupDescription?: string
  readonly status: 'known' | 'partial' | 'unsupported' | 'failure'
}

/** One model an auth file currently serves. */
export interface DesktopAccountPoolModel {
  readonly id: string
  readonly name?: string
  readonly ownedBy?: string
}

/** One redacted account-pool card. */
export interface DesktopAccountPoolAccount {
  readonly authIndex: string
  readonly name: string
  readonly provider: string
  readonly label: string
  readonly email?: string
  readonly status: string
  readonly statusMessage?: string
  readonly enabled: boolean
  readonly successCount: number
  readonly failCount: number
  readonly createdAt?: string
  readonly modifiedAt?: string
  readonly sizeBytes?: number
  readonly note?: string
  readonly prefix?: string
  readonly proxyUrl?: string
  readonly priority?: number
  readonly weight?: number
  readonly disableCooling?: boolean
  readonly websockets?: boolean
  readonly excludedModels?: readonly string[]
  readonly headers?: Readonly<Record<string, string>>
  readonly recentRequests?: readonly DesktopAccountPoolRecentRequest[]
  readonly projectId?: string
  readonly planType?: string
  readonly resetCreditsAvailable?: number
  readonly quota: readonly DesktopAccountPoolQuotaWindow[]
}

/** One redacted recent-request health bucket. */
export interface DesktopAccountPoolRecentRequest {
  readonly success: number
  readonly failed: number
}

/** Editable auth-file fields written through PATCH /auth-files/fields. */
export interface DesktopAccountPoolFieldPatch {
  readonly note?: string
  readonly prefix?: string
  readonly proxyUrl?: string
  readonly priority?: number
  readonly weight?: number
  readonly disableCooling?: boolean
  readonly websockets?: boolean
  readonly excludedModels?: readonly string[]
  readonly headers?: Readonly<Record<string, string>>
}

/** Redacted editable fields plus INFO preview for the settings dialog. */
export interface DesktopAccountPoolEditableFields {
  readonly name: string
  readonly info: Readonly<Record<string, string | number | boolean>>
  readonly fields: DesktopAccountPoolFieldPatch
}

/** Immutable account-pool snapshot pushed to the page. */
export interface DesktopAccountPoolSnapshot {
  readonly state: AccountPoolPhase
  readonly accounts: readonly DesktopAccountPoolAccount[]
  readonly login?: AccountPoolLoginStart
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
  /**
   * Cancel GitHub authorization while the Host is authorizing or polling.
   * Idle, signed-in, signing-out, failed, and unavailable snapshots are unchanged.
   */
  readonly accountCancelLogin: () => Promise<DesktopAccountSnapshot>
  /** Revoke only this installation's Account Session. */
  readonly accountSignOut: () => Promise<DesktopAccountSnapshot>
  /** Refresh active Mobile Installations owned by the signed-in Account. */
  readonly accountRefreshMobileInstallations: () => Promise<DesktopAccountSnapshot>
  /** Remotely sign one opaque Mobile Installation target out. */
  readonly accountRevokeMobileInstallation: (installationId: string) => Promise<DesktopAccountSnapshot>
  /** Subscribe to current-installation Account transitions. */
  readonly onAccountSnapshot: (listener: (snapshot: DesktopAccountSnapshot) => void) => () => void
  /** Authenticated Project Membership operations owned by the Desktop Host. */
  readonly projectMembership?: ProjectMembershipClient
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
  /** Revoke one confirmed pairing and drop its Relay authority. */
  readonly pairingRevoke: (pairingId: PersonalPairingId) => Promise<DesktopPairingSnapshot>
  /** Subscribe to Mobile Access and Personal Pairing transitions. */
  readonly onPairingSnapshot: (listener: (snapshot: DesktopPairingSnapshot) => void) => () => void
  /** Read the built-in account-pool snapshot. */
  readonly accountPoolGetSnapshot: () => Promise<DesktopAccountPoolSnapshot>
  /** Refresh the redacted roster. */
  readonly accountPoolRefresh: () => Promise<DesktopAccountPoolSnapshot>
  /** Enable or disable one auth file. */
  readonly accountPoolSetEnabled: (name: string, enabled: boolean) => Promise<DesktopAccountPoolSnapshot>
  /** Delete one auth file. */
  readonly accountPoolDelete: (name: string) => Promise<DesktopAccountPoolSnapshot>
  /** Start a supported login. */
  readonly accountPoolStartLogin: (kind: AccountPoolLoginKind) => Promise<AccountPoolLoginStart>
  /** Poll an in-flight login. */
  readonly accountPoolLoginStatus: (state: string) => Promise<DesktopAccountPoolSnapshot>
  /** Cancel an in-flight OAuth session. */
  readonly accountPoolCancelLogin: (state: string) => Promise<DesktopAccountPoolSnapshot>
  /** Dismiss a failed or in-flight login overlay. */
  readonly accountPoolDismissLogin: () => Promise<DesktopAccountPoolSnapshot>
  /** Open one https authorization URL in the operating-system browser. */
  readonly accountPoolOpenExternal: (url: string) => Promise<void>
  /** Submit a PKCE callback URL copied from the operating-system browser. */
  readonly accountPoolSubmitCallback: (
    input: { provider: AccountPoolLoginKind; redirectUrl: string },
  ) => Promise<DesktopAccountPoolSnapshot>
  /** Submit a GLM Coding Plan key; the key never returns in the snapshot. */
  readonly accountPoolSubmitGlmKey: (
    input: { apiKey: string; site?: string; organization?: string; project?: string },
  ) => Promise<DesktopAccountPoolSnapshot>
  /** Refresh one account quota observation. */
  readonly accountPoolRefreshQuota: (authIndex: string) => Promise<DesktopAccountPoolSnapshot>
  /** Refresh quota observations for every account. */
  readonly accountPoolRefreshAllQuota: () => Promise<DesktopAccountPoolSnapshot>
  /** List models one auth file currently serves. */
  readonly accountPoolListModels: (name: string) => Promise<readonly DesktopAccountPoolModel[]>
  /** Save one auth file through a Host-owned save dialog. */
  readonly accountPoolDownload: (name: string) => Promise<{ ok: boolean; error?: string }>
  /** Read redacted editable fields for the settings dialog. */
  readonly accountPoolReadFields: (name: string) => Promise<DesktopAccountPoolEditableFields>
  /** Write editable auth-file fields. */
  readonly accountPoolPatchFields: (
    name: string,
    fields: DesktopAccountPoolFieldPatch,
  ) => Promise<DesktopAccountPoolSnapshot>
  /** Subscribe to account-pool snapshots. */
  readonly onAccountPoolSnapshot: (listener: (snapshot: DesktopAccountPoolSnapshot) => void) => () => void
  /** Place one official Runtime page over the sidebar viewport. */
  readonly browserPresent?: (request: DesktopBrowserPresentRequest) => Promise<void>
  /** Hide one official Runtime page when its tab is not visible. */
  readonly browserConceal?: (target: DesktopBrowserPresentTarget) => Promise<void>
  /** Paint Settings or the sidebar + menu in the native overlay view. */
  readonly chromeOverlayShow: (request: ChromeOverlayShowRequest) => Promise<void>
  /** Hide the native overlay view. */
  readonly chromeOverlayHide: () => Promise<void>
  /** Read the overlay request the Host last accepted. */
  readonly chromeOverlayGetState: () => Promise<ChromeOverlayShowRequest | null>
  /** Tell the Host chrome document the overlay closed or selected a row. */
  readonly chromeOverlayResult: (result: ChromeOverlayResult) => void
  /**
   * Subscribe to overlay paint requests (overlay document).
   * @param listener - called with the live request, or null when hidden.
   * @returns unsubscribe.
   */
  readonly onChromeOverlayState: (
    listener: (state: ChromeOverlayShowRequest | null) => void,
  ) => () => void
  /**
   * Subscribe to overlay replies (Host chrome document).
   * @param listener - called after select or dismiss.
   * @returns unsubscribe.
   */
  readonly onChromeOverlayResult: (listener: (result: ChromeOverlayResult) => void) => () => void
}

declare global {
  interface Window {
    /** Desktop Host bridge; missing in browser `dsh web`. */
    dshDesktop?: DesktopBridge
  }
}
