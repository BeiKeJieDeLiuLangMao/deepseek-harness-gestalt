/**
 * Narrow Electron APIs used by the in-process Browser Runtime.
 * @module @deepseek-ai/dsh-browser-runtime-electron/electron
 */

/** Pixel buffer returned by `webContents.capturePage`. */
export interface ElectronNativeImage {
  /** Encode the captured page as PNG bytes. */
  toPNG(): Uint8Array
}

/** Isolated Chromium session that backs one persist or ephemeral partition. */
export interface ElectronSession {
  /** Persist cookies, cache, and service-worker state for a named Profile. */
  flushStorageData(): Promise<void>
  /** Clear ephemeral partition state when a temporary Profile closes. */
  clearStorageData(): Promise<void>
}

/** Hidden page used for navigation, observation, and screenshots. */
export interface ElectronWebContents {
  /** Current document URL, including `about:blank`. */
  getURL(): string
  /** Document title reported by Chromium. */
  getTitle(): string
  /** Isolated session that owns this page. */
  readonly session: ElectronSession
  /** True after Chromium destroyed the contents. */
  isDestroyed(): boolean
  /** Navigate and resolve after the first successful document load. */
  loadURL(url: string): Promise<void>
  /** Focus the hidden contents so later Agent or human mutations address it. */
  focus(): void
  /** Deliver one human input event into the hidden contents. */
  sendInputEvent(event: { readonly type: 'char'; readonly keyCode: string }): void
  /** Capture the current page as a PNG. */
  capturePage(): Promise<ElectronNativeImage>
  /** Read model-visible page text from the isolated world. */
  executeJavaScript(code: string): Promise<unknown>
  /** Destroy the hidden contents. */
  close(): void
  /** Observe renderer-process loss. */
  on(event: 'render-process-gone', listener: () => void): this
  /** Remove one renderer-process-loss listener. */
  off(event: 'render-process-gone', listener: () => void): this
}

/** Hidden BrowserWindow that owns one offscreen `webContents`. */
export interface ElectronBrowserWindow {
  /** Page this window owns. */
  readonly webContents: ElectronWebContents
  /** True after the window was destroyed. */
  isDestroyed(): boolean
  /** Destroy the hidden window and its contents. */
  destroy(): void
}

/** Options for one hidden offscreen window. */
export interface ElectronBrowserWindowOptions {
  /** Keep the window hidden. */
  readonly show: false
  /** Capture width in CSS pixels. */
  readonly width: number
  /** Capture height in CSS pixels. */
  readonly height: number
  /** Paint the first frame before the window is shown. */
  readonly paintWhenInitiallyHidden: true
  /** Isolated Chromium preferences for this window. */
  readonly webPreferences: {
    /** Persist or ephemeral partition key. */
    readonly partition: string
    /** Render offscreen so the Dock stays a screenshot pane. */
    readonly offscreen: true
    /** Sandbox the renderer. */
    readonly sandbox: true
    /** Isolate the renderer world. */
    readonly contextIsolation: true
    /** Keep Node APIs out of the page. */
    readonly nodeIntegration: false
    /** Keep hidden pages painting. */
    readonly backgroundThrottling: false
  }
}

/** Constructor for one hidden offscreen window. */
export type ElectronBrowserWindowConstructor = new (options: ElectronBrowserWindowOptions) => ElectronBrowserWindow

/** Electron `session` module used to isolate persist and ephemeral partitions. */
export interface ElectronSessionModule {
  /** Create or reuse the Chromium session for one partition string. */
  fromPartition(partition: string): ElectronSession
}

/** Electron APIs required by this Provider. */
export interface ElectronHost {
  /** Hidden-window constructor. */
  readonly BrowserWindow: ElectronBrowserWindowConstructor
  /** Partitioned session factory. */
  readonly session: ElectronSessionModule
}

/**
 * True when this process is Electron rather than Node.
 * @param versions - Process version map to inspect.
 * @returns whether `versions.electron` is a non-empty string.
 */
export function isElectronProcess(versions: NodeJS.ProcessVersions = process.versions): boolean {
  return typeof versions.electron === 'string' && versions.electron.length > 0
}

/**
 * Reject composition on a Node process that is not Electron.
 * @param versions - Process version map to inspect.
 */
export function requireElectronProcess(versions: NodeJS.ProcessVersions = process.versions): void {
  if (!isElectronProcess(versions)) {
    throw new Error('browser-runtime-electron: process.versions.electron must be set; this Provider loads only inside Electron')
  }
}

/**
 * Validate one imported Electron module as BrowserWindow and session factories.
 * @param loaded - Value returned by `import('electron')`.
 * @returns BrowserWindow and session factories from that module.
 */
export function electronHostFromModule(loaded: unknown): ElectronHost {
  if (typeof loaded !== 'object' || loaded === null) {
    throw new Error('browser-runtime-electron: the Electron module did not expose BrowserWindow and session')
  }
  const record = loaded as Record<string, unknown>
  const browserWindow = record.BrowserWindow
  const session = record.session
  if (typeof browserWindow !== 'function' || session === undefined) {
    throw new Error('browser-runtime-electron: the Electron module did not expose BrowserWindow and session')
  }
  return {
    BrowserWindow: browserWindow as ElectronBrowserWindowConstructor,
    session: session as ElectronSessionModule,
  }
}

/**
 * Load the in-process Electron APIs or fail loud.
 * @returns BrowserWindow and session factories from this Electron process.
 */
export async function loadElectronHost(): Promise<ElectronHost> {
  requireElectronProcess()
  return electronHostFromModule(await import('electron'))
}
