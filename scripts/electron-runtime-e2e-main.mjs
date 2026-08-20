/**
 * Electron application entry for the declared Browser Runtime e2e launch mode.
 *
 * Waits for `app.whenReady()`, then loads the shared TypeScript cases in this
 * main process so `session.fromPartition` and hidden `BrowserWindow` stay on
 * the Electron main thread.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app } from 'electron'

const repoRoot = dirname(fileURLToPath(new URL('..', import.meta.url)))
const casesHref = pathToFileURL(
  join(repoRoot, 'packages/browser/browser-runtime-electron/tests/runtime.e2e.cases.ts'),
).href

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

const userData = await mkdtemp(join(tmpdir(), 'dsh-electron-runtime-e2e-'))
app.setPath('userData', userData)

function readyOrTimeout(ms) {
  return Promise.race([
    app.whenReady(),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`electron-runtime-e2e: app.whenReady() timed out after ${String(ms)}ms`))
      }, ms)
    }),
  ])
}

try {
  process.chdir(repoRoot)
  await readyOrTimeout(30_000)
  app.dock?.hide()
  console.error(`electron-runtime-e2e: ready electron=${process.versions.electron ?? ''}`)
  register('tsx/esm', pathToFileURL(join(repoRoot, 'package.json')).href)
  const { runElectronRuntimeE2eCases } = await import(casesHref)
  await runElectronRuntimeE2eCases()
  console.error('electron-runtime-e2e: cases passed')
  await rm(userData, { recursive: true, force: true })
  app.exit(0)
} catch (error) {
  console.error(error)
  await rm(userData, { recursive: true, force: true })
  app.exit(1)
}
