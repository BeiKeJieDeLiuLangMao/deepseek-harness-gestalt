import { Buffer } from 'node:buffer'
import type {
  ElectronBrowserWindow,
  ElectronHost,
  ElectronNativeImage,
  ElectronSession,
  ElectronWebContents,
} from '../src/electron.ts'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

export const PNG_1X1_BASE64 = PNG_1X1.toString('base64')

interface FakePage {
  url: string
  title: string
  text: string
}

interface FakeOptions {
  readonly loadDelayMs?: number
  readonly captureDelayMs?: number
  readonly captureEmpty?: boolean
  readonly crashOnLoad?: boolean
  readonly failLoad?: boolean
  readonly failExecute?: boolean
  readonly executeNonString?: boolean
  readonly failFlush?: boolean
  readonly failClear?: boolean
}

function titleFor(url: string): string {
  if (url === 'about:blank') return 'New Tab'
  if (url === 'https://example.test/') return 'Example Domain'
  if (url === 'https://login.test/') return 'Sign in'
  return 'Loaded page'
}

function textFor(url: string, identity: string): string {
  if (url === 'about:blank') return identity.length === 0 ? '' : `identity=${identity}`
  if (url === 'https://example.test/') {
    return identity.length === 0 ? 'An Electron protocol page.' : `An Electron protocol page.\nidentity=${identity}`
  }
  if (url === 'https://login.test/') return `Signed in as ${identity}.\nidentity=${identity}`
  return identity.length === 0 ? 'Loaded page text.' : `Loaded page text.\nidentity=${identity}`
}

function identityFrom(partition: string): string {
  if (partition.includes('-tmp-')) return ''
  const marker = partition.lastIndexOf('-')
  return marker === -1 ? partition : partition.slice(marker + 1)
}

class FakeNativeImage implements ElectronNativeImage {
  constructor(private readonly bytes: Uint8Array) {}
  toPNG(): Uint8Array {
    return this.bytes
  }
}

class FakeSession implements ElectronSession {
  flushed = 0
  cleared = 0
  constructor(
    readonly partition: string,
    private readonly options: FakeOptions,
  ) {}
  async flushStorageData(): Promise<void> {
    if (this.options.failFlush === true) throw new Error('flush failed')
    this.flushed += 1
  }
  async clearStorageData(): Promise<void> {
    if (this.options.failClear === true) throw new Error('clear failed')
    this.cleared += 1
  }
}

class FakeWebContents implements ElectronWebContents {
  private href = 'about:blank'
  private heading = 'New Tab'
  destroyed = false
  focused = false
  private readonly listeners = new Set<() => void>()
  constructor(
    readonly session: FakeSession,
    private readonly page: FakePage,
    private readonly options: FakeOptions,
  ) {}
  getURL(): string {
    return this.href
  }
  getTitle(): string {
    return this.heading
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  async loadURL(url: string): Promise<void> {
    if (this.options.failLoad === true) throw new Error('load failed')
    if (this.options.loadDelayMs !== undefined && url !== 'about:blank') {
      await new Promise(resolve => setTimeout(resolve, this.options.loadDelayMs))
    }
    const identity = identityFrom(this.session.partition)
    this.href = url
    this.heading = titleFor(url)
    this.page.url = url
    this.page.title = this.heading
    this.page.text = textFor(url, identity)
    if (this.options.crashOnLoad === true) this.emitCrash()
  }
  focus(): void {
    this.focused = true
  }
  sendInputEvent(event: { readonly type: 'char'; readonly keyCode: string }): void {
    this.page.text += event.keyCode
  }
  async capturePage(): Promise<ElectronNativeImage> {
    if (this.options.captureDelayMs !== undefined) {
      await new Promise(resolve => setTimeout(resolve, this.options.captureDelayMs))
    }
    if (this.options.captureEmpty === true) return new FakeNativeImage(new Uint8Array())
    return new FakeNativeImage(PNG_1X1)
  }
  async executeJavaScript(code?: string): Promise<unknown> {
    if (this.options.failExecute === true) throw new Error('execute failed')
    if (this.options.executeNonString === true) return 7
    if (typeof code === 'string' && code.includes('(text) =>')) return undefined
    return this.page.text
  }
  close(): void {
    this.destroyed = true
  }
  on(event: 'render-process-gone', listener: () => void): this {
    if (event === 'render-process-gone') this.listeners.add(listener)
    return this
  }
  off(event: 'render-process-gone', listener: () => void): this {
    if (event === 'render-process-gone') this.listeners.delete(listener)
    return this
  }
  emitCrash(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

class FakeBrowserWindow implements ElectronBrowserWindow {
  destroyed = false
  readonly webContents: FakeWebContents
  constructor(webContents: FakeWebContents) {
    this.webContents = webContents
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
    this.webContents.destroyed = true
  }
}

function createBrowserWindow(
  host: FakeElectronHost,
  windowOptions: { readonly webPreferences: { readonly partition: string } },
): FakeBrowserWindow {
  const session = host.session.fromPartition(windowOptions.webPreferences.partition) as FakeSession
  const page: FakePage = { url: 'about:blank', title: 'New Tab', text: '' }
  const contents = new FakeWebContents(session, page, host.options)
  const window = new FakeBrowserWindow(contents)
  host.windows.push(window)
  return window
}

/** In-memory Electron APIs that never spawn Chromium or Tandem. */
export class FakeElectronHost implements ElectronHost {
  readonly sessions = new Map<string, FakeSession>()
  readonly windows: FakeBrowserWindow[] = []
  readonly BrowserWindow: ElectronHost['BrowserWindow']
  constructor(readonly options: FakeOptions = {}) {
    const create = (windowOptions: { readonly webPreferences: { readonly partition: string } }): FakeBrowserWindow =>
      createBrowserWindow(this, windowOptions)
    this.BrowserWindow = function BrowserWindow(this: unknown, windowOptions: { readonly webPreferences: { readonly partition: string } }) {
      return create(windowOptions)
    } as unknown as ElectronHost['BrowserWindow']
  }
  readonly session = {
    fromPartition: (partition: string): ElectronSession => {
      const existing = this.sessions.get(partition)
      if (existing !== undefined) return existing
      const created = new FakeSession(partition, this.options)
      this.sessions.set(partition, created)
      return created
    },
  }
}
