/** Platform-specific native frame options for the Desktop Host window. */
import type { BrowserWindowConstructorOptions } from 'electron'

/** Native-frame fields selected by the Desktop Host. */
export type WindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'trafficLightPosition'
>

/**
 * Select native window chrome without leaking macOS-only options to Windows.
 * @param platform - Node platform string.
 * @returns BrowserWindow native-frame options.
 */
export function windowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      frame: false,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 8 },
    }
  }
  if (platform === 'win32') return { frame: false }
  return { frame: true }
}
