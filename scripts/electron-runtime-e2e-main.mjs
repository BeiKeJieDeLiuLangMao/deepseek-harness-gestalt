/**
 * Electron application entry for the declared Browser Runtime e2e launch mode.
 *
 * Subscribes to `app.whenReady()` without top-level await: Electron emits
 * ready only after this module finishes evaluating, so awaiting ready at
 * top level deadlocks. Isolated `userData` is set before that subscription.
 * After ready, the main imports the Node-bundled cases path. tsx load hooks
 * and Node `--import` must not run in this process.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app } from 'electron'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const casesPath = process.env.DSH_ELECTRON_RUNTIME_E2E_CASES
const userData = mkdtempSync(join(tmpdir(), 'dsh-electron-runtime-e2e-'))

if (casesPath === undefined || casesPath === '') {
  throw new Error('electron-runtime-e2e: DSH_ELECTRON_RUNTIME_E2E_CASES is missing')
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
}
app.on('window-all-closed', () => {
  // Keep the runner alive after the last hidden BrowserWindow closes.
})
app.setPath('userData', userData)

void app.whenReady().then(async () => {
  process.chdir(repoRoot)
  app.dock?.hide()
  console.error(`electron-runtime-e2e: ready electron=${process.versions.electron ?? ''}`)
  const { runElectronRuntimeE2eCases } = await import(pathToFileURL(casesPath).href)
  await runElectronRuntimeE2eCases()
  console.error('electron-runtime-e2e: cases passed')
  rmSync(userData, { recursive: true, force: true })
  app.exit(0)
}).catch((error) => {
  console.error(error)
  rmSync(userData, { recursive: true, force: true })
  app.exit(1)
})
