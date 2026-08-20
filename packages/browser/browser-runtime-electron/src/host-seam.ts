/**
 * Package-private Electron host holder. Production composition never writes it;
 * Node tests install a host through the `./testing` export.
 * @module
 */

import type { ElectronHost } from './electron.ts'

let testElectronHost: ElectronHost | undefined

/**
 * Read the host installed for Node unit tests, if any.
 * @returns the installed host, or `undefined` so production loads real Electron.
 */
export function electronTestHost(): ElectronHost | undefined {
  return testElectronHost
}

/**
 * Replace the Node-test Electron host.
 * @param host - Injected BrowserWindow and session factories, or `undefined` to clear the seam.
 */
export function setElectronTestHost(host: ElectronHost | undefined): void {
  testElectronHost = host
}
