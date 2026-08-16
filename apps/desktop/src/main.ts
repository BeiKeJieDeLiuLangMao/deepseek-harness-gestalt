/**
 * DeepSeek Gestalt Desktop Host: one window, one Web Host child, GitHub updates.
 * @module @deepseek-ai/dsh-desktop/main
 */
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, Menu, ipcMain, type IpcMainEvent,
} from 'electron'
import {
  UPDATER_CHECK_NOW, UPDATER_DOWNLOAD_NOW, UPDATER_GET_STATUS,
  UPDATER_QUIT_AND_INSTALL, UPDATER_STATUS_CHANGED,
  WINDOW_CLOSE, WINDOW_FULLSCREEN, WINDOW_FULLSCREEN_CHANGED,
  WINDOW_MAXIMIZE, WINDOW_MINIMIZE,
  type UpdaterStatus,
} from '@deepseek-ai/dsh-client-ui-desktop/protocol'
import { ensureLaunchDirectory } from './launch-directory.ts'
import { isElectronExecutable, resolveDesktopRuntime } from './runtime-paths.ts'
import { planHostExit } from './host-exit.ts'
import { spawnWebHost, type RunningWebHost } from './spawn-web-host.ts'
import {
  autoUpdaterFromModule, startAutoUpdater, type AutoUpdaterLifecycle,
} from './updater.ts'
import { windowChromeOptions } from './window-options.ts'

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

smokeLog('main loaded')
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
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
  if (shuttingDown) return
  event.preventDefault()
  requestShutdown(0)
})
process.once('SIGINT', () => { app.quit() })
process.once('SIGTERM', () => { app.quit() })

/** Create the window, spawn Web Host, attach updater. */
async function boot(): Promise<void> {
  window = createWindow()
  installIpc()
  installMenu()
  try {
    host = await startHost()
    smokeLog('host ' + host.url + ' pid ' + String(host.child.pid))
    await window.loadURL(host.url)
    host.child.once('exit', () => { void onHostExit() })
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
  if (!app.isPackaged) {
    pushStatus({ state: 'disabled', lastCheckedAt: null })
    return
  }
  try {
    const autoUpdater = autoUpdaterFromModule(await import('electron-updater'))
    updater = startAutoUpdater({
      updater: autoUpdater,
      onStateChange: pushStatus,
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
  window = createWindow()
  if (host !== undefined) {
    try {
      await window.loadURL(host.url)
    } catch (error) {
      await showError(window, error)
    }
    return
  }
  await boot()
}

function createWindow(): BrowserWindow {
  const target = new BrowserWindow({
    ...windowChromeOptions(process.platform),
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
  return target
}

function syncTrafficLights(target: BrowserWindow, fullscreen: boolean): void {
  if (process.platform === 'darwin') {
    target.setWindowButtonPosition(fullscreen ? null : { x: 12, y: 8 })
  }
  target.webContents.send(WINDOW_FULLSCREEN_CHANGED, fullscreen)
}

async function startHost(): Promise<RunningWebHost> {
  const paths = resolveDesktopRuntime({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    moduleUrl: import.meta.url,
  })
  if (!app.isPackaged && isElectronExecutable(paths.node)) {
    throw new Error('Desktop Host needs a real Node executable; set DSH_NODE or run via pnpm gestalt:dev')
  }
  return spawnWebHost({
    node: paths.node,
    args: paths.args,
    cwd: app.isPackaged ? ensureLaunchDirectory() : (paths.workspaceRoot ?? ensureLaunchDirectory()),
    env: { DSH_DESKTOP: '1' },
  })
}

async function onHostExit(): Promise<void> {
  if (shuttingDown) return
  const plan = planHostExit(window !== undefined && !window.isDestroyed(), respawned)
  if (plan === 'ignore' || window === undefined) return
  if (plan === 'respawn') {
    respawned = true
    try {
      host = await startHost()
      await window.loadURL(host.url)
      host.child.once('exit', () => { void onHostExit() })
    } catch (error) {
      await showError(window, error)
    }
    return
  }
  await showError(window, new Error('Web Host exited'))
}

async function finishSmoke(target: BrowserWindow): Promise<void> {
  const kind: unknown = await target.webContents.executeJavaScript('typeof window.__DSH_BOOT__')
  if (kind !== 'object') {
    smokeLog('missing window.__DSH_BOOT__')
    console.error('dsh desktop smoke: missing window.__DSH_BOOT__')
    requestShutdown(1)
    return
  }
  smokeLog('ok')
  console.log('dsh desktop smoke: ok')
  app.quit()
}

function requestShutdown(exitCode: number): void {
  if (shuttingDown) return
  shuttingDown = true
  updater?.dispose()
  updater = undefined
  const running = host
  host = undefined
  void (async () => {
    await running?.stop()
    app.exit(exitCode)
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
  ipcMain.handle(WINDOW_FULLSCREEN, () => window?.isFullScreen() ?? false)
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
