/**
 * Test-only Electron host seam. Production composition never imports this module.
 * @module @deepseek-ai/dsh-browser-runtime-electron/testing
 */

import type { ElectronHost } from './electron.ts'
import { electronTestHost, setElectronTestHost } from './host-seam.ts'

/**
 * Install one Electron host for Node unit tests and return a disposer that
 * clears the seam only when this installation is still current.
 * @param host - Injected BrowserWindow and session factories, or `undefined` to clear the seam.
 * @returns a function that restores an empty seam when this call still owns it.
 */
export function installElectronTestHost(host: ElectronHost | undefined): () => void {
  setElectronTestHost(host)
  return () => {
    if (electronTestHost() === host) setElectronTestHost(undefined)
  }
}
