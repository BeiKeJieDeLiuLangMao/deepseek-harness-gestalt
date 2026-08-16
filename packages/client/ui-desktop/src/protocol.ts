/**
 * Desktop Host bridge: preload `contextBridge` surface and updater phases.
 * The page never imports Electron; it only reads `window.dshDesktop`.
 * @module @deepseek-ai/dsh-client-ui-desktop/protocol
 */

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
}

declare global {
  interface Window {
    /** Desktop Host bridge; missing in browser `dsh web`. */
    dshDesktop?: DesktopBridge
  }
}
