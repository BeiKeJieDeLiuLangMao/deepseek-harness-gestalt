/**
 * DeepSeek Gestalt Desktop Host: one window, one Web Host child, GitHub updates.
 * @module @deepseek-ai/dsh-desktop/main
 */
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, Menu, ipcMain, safeStorage, shell, type IpcMainEvent,
} from 'electron'
import {
  ACCOUNT_ACCEPT_PRIVACY, ACCOUNT_BEGIN_LOGIN, ACCOUNT_GET_SNAPSHOT,
  ACCOUNT_SIGN_OUT, ACCOUNT_SNAPSHOT_CHANGED,
  PAIRING_CANCEL_CHALLENGE, PAIRING_CONFIRM, PAIRING_CREATE_CHALLENGE,
  PAIRING_GET_SNAPSHOT, PAIRING_REJECT, PAIRING_SET_ENABLED, PAIRING_SNAPSHOT_CHANGED,
  UPDATER_CHECK_NOW, UPDATER_DOWNLOAD_NOW, UPDATER_GET_STATUS,
  UPDATER_QUIT_AND_INSTALL, UPDATER_STATUS_CHANGED,
  WINDOW_CLOSE, WINDOW_MAXIMIZE, WINDOW_MINIMIZE,
  type UpdaterStatus,
} from '@deepseek-ai/dsh-client-ui-desktop/protocol'
import { PlatformAccountHttpTransport } from '@deepseek-ai/dsh-platform-account-client'
import { RemoteAccessHttpTransport } from '@deepseek-ai/dsh-remote-access-client'
import type { SelectedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'
import { ensureLaunchDirectory } from './launch-directory.ts'
import { isElectronExecutable, resolveDesktopRuntime } from './runtime-paths.ts'
import { planHostExit, shouldPreventQuit, startWithOneRetry } from './host-exit.ts'
import { classifyNavigation } from './navigation-policy.ts'
import { spawnWebHost, type RunningWebHost } from './spawn-web-host.ts'
import {
  autoUpdaterFromModule, startAutoUpdater, type AutoUpdaterLifecycle, type AutoUpdaterModule,
} from './updater.ts'
import { windowChromeOptions } from './window-options.ts'
import { desktopIconOptions } from './app-icon.ts'
import { loadDesktopPlatformEnvironment } from './platform-environment.ts'
import {
  DesktopAccountController, EncryptedDesktopAccountStore,
  UnavailableDesktopAccountController, type DesktopAccountActions,
} from './platform-account.ts'
import {
  DesktopPairingController,
  UnavailableDesktopPairingController,
  confirmPairingFromIpc,
  rejectPairingFromIpc,
  setPairingEnabledFromIpc,
  type DesktopPairingActions,
} from './personal-pairing.ts'
import { disposeDesktopOwners } from './shutdown.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PRELOAD = join(here, 'preload.cjs')

function smokeLog(line: string): void {
  const file = process.env.DSH_DESKTOP_SMOKE_FILE
  if (file === undefined || file.length === 0) return
  appendFileSync(file, line + '\n')
}

let host: RunningWebHost | undefined
let window: BrowserWindow | undefined
let updater: AutoUpdaterLifecycle | undefined
let respawned = false
let shuttingDown = false
let integrationsInstalled = false
let updaterInitialized = false
let account: DesktopAccountActions = new UnavailableDesktopAccountController('Platform Account is starting')
let stopAccountEvents: (() => void) | undefined
let pairing: DesktopPairingActions = new UnavailableDesktopPairingController(
  'Personal Pairing waits for the independent Noise security review.',
)
let stopPairingEvents: (() => void) | undefined
let accountSignedIn = false
const hostStartController = new AbortController()
let pendingHost: Promise<RunningWebHost> | undefined

smokeLog('main loaded')
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  smokeLog('error single-instance lock unavailable')
  app.quit()
} else {
  app.on('second-instance', () => { void focusOrReopen() })
  app.on('activate', () => { void focusOrReopen() })
  void app.whenReady().then(() => { void boot() })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (!shouldPreventQuit({ shuttingDown, updaterState: updater?.state().state })) {
    if (!shuttingDown) requestShutdown(0, 'allow-quit')
    return
  }
  event.preventDefault()
  requestShutdown(0)
})
process.once('SIGINT', () => { app.quit() })
process.once('SIGTERM', () => { app.quit() })

/** Create the window, spawn Web Host, attach updater. */
async function boot(): Promise<void> {
  smokeLog('boot start')
  window = createWindow()
  smokeLog('window created')
  let accountEnvironment: SelectedPlatformEnvironment | undefined
  try {
    accountEnvironment = loadDesktopPlatformEnvironment(process.env)
  } catch (error) {
    smokeLog('account environment unavailable ' + (error instanceof Error ? error.message : String(error)))
  }
  if (accountEnvironment === undefined) {
    account = new UnavailableDesktopAccountController('Platform environment is not configured')
    pairing = new UnavailableDesktopPairingController('Platform environment is not configured')
  } else {
    account = createDesktopAccount(accountEnvironment)
    pairing = createDesktopPairing(accountEnvironment, account)
    void account.start().then(() => {
      smokeLog('account ready')
    }).catch((error: unknown) => {
      smokeLog('account start failed ' + (error instanceof Error ? error.message : String(error)))
      stopAccountEvents?.()
      const failed = account
      account = new UnavailableDesktopAccountController(
        error instanceof Error ? error.message : String(error),
      )
      stopAccountEvents = account.subscribe(handleAccountSnapshot)
      void failed.dispose().catch((disposeError: unknown) => {
        console.error('[desktop-platform-account] dispose after failed start:', disposeError)
      })
    })
  }
  stopPairingEvents = pairing.subscribe(pushPairingSnapshot)
  stopAccountEvents = account.subscribe(handleAccountSnapshot)
  installIntegrationsOnce()
  try {
    const started = respawned
      ? { value: await startHost(), retried: false }
      : await startWithOneRetry(
        startHost,
        () => { respawned = true },
        () => !hostStartController.signal.aborted,
      )
    host = started.value
    observeHostExit(host)
    smokeLog('host ' + host.url + ' pid ' + String(host.child.pid))
    await window.loadURL(host.url)
    if (process.env.DSH_DESKTOP_SMOKE === '1') {
      await finishSmoke(window)
      return
    }
  } catch (error) {
    smokeLog('error ' + (error instanceof Error ? error.message : String(error)))
    await showError(window, error)
    if (process.env.DSH_DESKTOP_SMOKE === '1') {
      requestShutdown(1)
      return
    }
  }
  if (updaterInitialized) return
  updaterInitialized = true
  if (!app.isPackaged) {
    pushStatus({ state: 'disabled', lastCheckedAt: null })
    return
  }
  try {
    const module = await import('electron-updater')
    const autoUpdater = autoUpdaterFromModule(module as unknown as AutoUpdaterModule)
    updater = startAutoUpdater({
      updater: autoUpdater,
      onStateChange: pushStatus,
      autoInstallOnAppQuit: process.platform === 'darwin',
    })
  } catch (error) {
    pushStatus({
      state: 'error',
      lastCheckedAt: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}

async function focusOrReopen(): Promise<void> {
  if (window !== undefined && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore()
    window.focus()
    return
  }
  if (host === undefined) {
    await boot()
    return
  }
  window = createWindow()
  try {
    await window.loadURL(host.url)
  } catch (error) {
    await showError(window, error)
  }
}

function createWindow(): BrowserWindow {
  const target = new BrowserWindow({
    ...windowChromeOptions(process.platform),
    ...desktopIconOptions({
      platform: process.platform,
      packaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      setDockIcon: (path) => { app.dock.setIcon(path) },
    }),
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: true,
    title: 'DeepSeek Gestalt',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  target.on('enter-full-screen', () => { syncTrafficLights(target, true) })
  target.on('leave-full-screen', () => { syncTrafficLights(target, false) })
  guardNavigation(target)
  return target
}

function guardNavigation(target: BrowserWindow): void {
  target.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })
  target.webContents.on('will-navigate', (event, url) => {
    const decision = classifyNavigation(url, host?.url)
    if (decision === 'host') return
    event.preventDefault()
    if (decision === 'external') openExternalIfAllowed(url)
  })
}

function openExternalIfAllowed(url: string): void {
  if (classifyNavigation(url, host?.url) !== 'external') return
  void shell.openExternal(url).catch((error: unknown) => {
    console.error('failed to open external URL', error)
  })
}

function syncTrafficLights(target: BrowserWindow, fullscreen: boolean): void {
  if (process.platform === 'darwin') {
    target.setWindowButtonPosition(fullscreen ? null : { x: 12, y: 8 })
  }
}

async function startHost(): Promise<RunningWebHost> {
  if (hostStartController.signal.aborted) throw new Error('dsh web startup aborted')
  const paths = resolveDesktopRuntime({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    moduleUrl: import.meta.url,
  })
  if (!app.isPackaged && isElectronExecutable(paths.node)) {
    throw new Error('Desktop Host needs a real Node executable; set DSH_NODE or run via pnpm gestalt:dev')
  }
  const pending = spawnWebHost({
    node: paths.node,
    args: paths.args,
    cwd: app.isPackaged ? ensureLaunchDirectory() : (paths.workspaceRoot ?? ensureLaunchDirectory()),
    env: { DSH_DESKTOP: '1' },
    signal: hostStartController.signal,
  })
  pendingHost = pending
  try {
    return await pending
  } finally {
    if (pendingHost === pending) pendingHost = undefined
  }
}

function observeHostExit(running: RunningWebHost): void {
  void running.exited.then(() => { void onHostExit(running) })
}

async function onHostExit(exited: RunningWebHost): Promise<void> {
  if (shuttingDown || host !== exited) return
  host = undefined
  const plan = planHostExit(window !== undefined && !window.isDestroyed(), respawned)
  if (plan === 'ignore' || window === undefined) return
  if (plan === 'respawn') {
    respawned = true
    try {
      host = await startHost()
      observeHostExit(host)
      await window.loadURL(host.url)
    } catch (error) {
      await showError(window, error)
    }
    return
  }
  await showError(window, new Error('Web Host exited'))
}

function installIntegrationsOnce(): void {
  if (integrationsInstalled) return
  integrationsInstalled = true
  installIpc()
  installMenu()
}

async function finishSmoke(target: BrowserWindow): Promise<void> {
  const evidence: unknown = await target.webContents.executeJavaScript(`(async () => {
    const bridge = window.dshDesktop
    const updaterStatus = await bridge?.getStatus()
    const pairingStatus = await bridge?.pairingGetSnapshot()
    const unsubscribe = typeof bridge?.onStatus === 'function'
      ? bridge.onStatus(() => {})
      : null
    if (typeof unsubscribe === 'function') unsubscribe()
    const rendererDeadline = Date.now() + 5_000
    while (
      document.querySelector('[data-desktop-updater-state="disabled"]') === null
      && Date.now() < rendererDeadline
    ) {
      await new Promise((resolve) => { setTimeout(resolve, 50) })
    }
    return {
      boot: typeof window.__DSH_BOOT__,
      gestalt: document.body.textContent?.includes('GESTALT') ?? false,
      updaterBridge: bridge !== undefined
        && typeof bridge.getStatus === 'function'
        && typeof bridge.checkNow === 'function'
        && typeof bridge.downloadNow === 'function'
        && typeof bridge.quitAndInstall === 'function'
        && typeof bridge.onStatus === 'function'
        && typeof unsubscribe === 'function',
      updaterState: updaterStatus?.state ?? null,
      pairingBridge: bridge !== undefined
        && typeof bridge.pairingGetSnapshot === 'function'
        && typeof bridge.pairingSetEnabled === 'function'
        && typeof bridge.pairingCreateChallenge === 'function'
        && typeof bridge.pairingCancelChallenge === 'function'
        && typeof bridge.pairingConfirm === 'function'
        && typeof bridge.pairingReject === 'function'
        && typeof bridge.onPairingSnapshot === 'function',
      mobileAccessEnabled: pairingStatus?.enabled ?? null,
      pairingState: pairingStatus?.status ?? null,
      rendererUpdaterState: document.querySelector('[data-desktop-updater-state]')
        ?.getAttribute('data-desktop-updater-state') ?? null,
      updateControlAbsent: document.querySelector('[data-desktop-update-control]') === null,
      chrome: document.querySelector('[data-desktop-chrome]')?.getAttribute('data-desktop-chrome') ?? null,
    }
  })()`)
  const expectedChrome = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null
  const valid = evidence !== null && typeof evidence === 'object'
    && 'boot' in evidence && evidence.boot === 'object'
    && 'gestalt' in evidence && evidence.gestalt === true
    && 'updaterBridge' in evidence && evidence.updaterBridge === true
    && 'updaterState' in evidence && evidence.updaterState === 'disabled'
    && 'pairingBridge' in evidence && evidence.pairingBridge === true
    && 'mobileAccessEnabled' in evidence && evidence.mobileAccessEnabled === false
    && 'pairingState' in evidence && evidence.pairingState === 'unavailable'
    && 'rendererUpdaterState' in evidence && evidence.rendererUpdaterState === 'disabled'
    && 'updateControlAbsent' in evidence && evidence.updateControlAbsent === true
    && 'chrome' in evidence && evidence.chrome === expectedChrome
  if (!valid) {
    smokeLog('missing Desktop Session Surface evidence ' + JSON.stringify(evidence))
    console.error('dsh desktop smoke: missing Desktop Session Surface evidence', evidence)
    requestShutdown(1)
    return
  }
  smokeLog('ok')
  console.log('dsh desktop smoke: ok')
  app.quit()
}

function requestShutdown(exitCode: number, mode: 'exit' | 'allow-quit' = 'exit'): void {
  if (shuttingDown) return
  shuttingDown = true
  if (mode === 'exit') {
    updater?.dispose()
    updater = undefined
  }
  stopAccountEvents?.()
  stopAccountEvents = undefined
  stopPairingEvents?.()
  stopPairingEvents = undefined
  const ownerDisposal = disposeDesktopOwners(account, pairing)
  hostStartController.abort()
  const starting = pendingHost
  const running = host
  host = undefined
  void (async () => {
    try {
      await ownerDisposal
      const started = await starting?.catch(() => undefined)
      if (started !== running) await started?.stop()
      await running?.stop()
      if (mode === 'exit') app.exit(exitCode)
    } catch (error) {
      console.error('dsh desktop: shutdown failed', error)
      if (mode === 'exit') app.exit(1)
    }
  })()
}

function installIpc(): void {
  ipcMain.handle(UPDATER_GET_STATUS, () => updater?.state() ?? { state: 'disabled', lastCheckedAt: null })
  ipcMain.on(UPDATER_CHECK_NOW, () => { updater?.checkForUpdates() })
  ipcMain.on(UPDATER_DOWNLOAD_NOW, () => { updater?.download() })
  ipcMain.on(UPDATER_QUIT_AND_INSTALL, () => { updater?.install() })
  ipcMain.on(WINDOW_MINIMIZE, () => { window?.minimize() })
  ipcMain.on(WINDOW_MAXIMIZE, () => {
    if (window === undefined) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on(WINDOW_CLOSE, (_event: IpcMainEvent) => { window?.close() })
  ipcMain.handle(ACCOUNT_GET_SNAPSHOT, () => account.getSnapshot())
  ipcMain.handle(ACCOUNT_ACCEPT_PRIVACY, () => account.acceptPrivacy())
  ipcMain.handle(ACCOUNT_BEGIN_LOGIN, () => account.beginLogin())
  ipcMain.handle(ACCOUNT_SIGN_OUT, async () => {
    const snapshot = await account.signOut()
    await pairing.deactivate()
    return snapshot
  })
  ipcMain.handle(PAIRING_GET_SNAPSHOT, () => pairing.getSnapshot())
  ipcMain.handle(PAIRING_SET_ENABLED, (_event, enabled: unknown) => setPairingEnabledFromIpc(pairing, enabled))
  ipcMain.handle(PAIRING_CREATE_CHALLENGE, () => pairing.createChallenge())
  ipcMain.handle(PAIRING_CANCEL_CHALLENGE, () => pairing.cancelChallenge())
  ipcMain.handle(PAIRING_CONFIRM, (_event, pendingPairingId: unknown) =>
    confirmPairingFromIpc(pairing, pendingPairingId))
  ipcMain.handle(PAIRING_REJECT, (_event, pendingPairingId: unknown) =>
    rejectPairingFromIpc(pairing, pendingPairingId))
}

function installMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { label: 'Check for Updates…', click: () => { updater?.checkForUpdates() } },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function pushStatus(status: UpdaterStatus): void {
  window?.webContents.send(UPDATER_STATUS_CHANGED, status)
}

function pushAccountSnapshot(snapshot: ReturnType<DesktopAccountActions['getSnapshot']>): void {
  window?.webContents.send(ACCOUNT_SNAPSHOT_CHANGED, snapshot)
}

function handleAccountSnapshot(snapshot: ReturnType<DesktopAccountActions['getSnapshot']>): void {
  pushAccountSnapshot(snapshot)
  const signedIn = snapshot.status === 'signed-in'
  if (signedIn && !accountSignedIn) {
    void pairing.start().catch((error: unknown) => {
      console.error('[desktop-personal-pairing] signed-in Remote Access load failed:', error)
    })
  }
  if (!signedIn && accountSignedIn) {
    void pairing.deactivate().catch((error: unknown) => {
      console.error('[desktop-personal-pairing] signed-out Remote Access shutdown failed:', error)
    })
  }
  accountSignedIn = signedIn
}

function pushPairingSnapshot(snapshot: ReturnType<DesktopPairingActions['getSnapshot']>): void {
  window?.webContents.send(PAIRING_SNAPSHOT_CHANGED, snapshot)
}

function createDesktopAccount(environment: SelectedPlatformEnvironment): DesktopAccountActions {
  if (!safeStorage.isEncryptionAvailable()) {
    return new UnavailableDesktopAccountController('Secure operating-system storage is unavailable')
  }
  const transport = new PlatformAccountHttpTransport({ environment })
  const store = new EncryptedDesktopAccountStore(
    join(app.getPath('userData'), `platform-account-${environment.databaseIdentity}.bin`),
    {
      encrypt: value => safeStorage.encryptString(value),
      decrypt: value => safeStorage.decryptString(Buffer.from(value)),
    },
  )
  return new DesktopAccountController({
    environment,
    transport,
    store,
    systemBrowser: { open: async (url) => { await shell.openExternal(url) } },
  })
}

function createDesktopPairing(
  environment: SelectedPlatformEnvironment,
  currentAccount: DesktopAccountActions,
): DesktopPairingActions {
  if (environment.environment !== 'development' || process.env.DSH_PERSONAL_PAIRING_KEYLESS !== '1') {
    return new UnavailableDesktopPairingController(
      'Personal Pairing requires an independently reviewed handshake provider. Development proof mode is disabled.',
    )
  }
  return new DesktopPairingController({
    account: currentAccount,
    transport: new RemoteAccessHttpTransport({ environment }),
  })
}

async function showError(target: BrowserWindow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const html = '<!doctype html><meta charset="utf-8"><title>DeepSeek Gestalt</title>'
    + '<body style="font:14px system-ui;padding:48px">'
    + '<h1>DeepSeek Gestalt</h1><p>Web Host failed to start.</p><pre>'
    + escapeHtml(message)
    + '</pre></body>'
  await target.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}
