/**
 * Dock / Start Menu cwd for the Web Host. Not a Workspace unless the user adopts it.
 * @module @deepseek-ai/dsh-desktop/launch-directory
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Last path segment of the Launch Directory. */
export const LAUNCH_DIRECTORY_NAME = 'defaultWorkspace'

/**
 * Resolve the Launch Directory without creating it.
 * @param home - operating-system home directory.
 * @param platform - Node platform string.
 * @param appData - Windows APPDATA, when present.
 * @returns absolute Launch Directory path.
 */
export function launchDirectory(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  appData: string | undefined = process.env.APPDATA,
): string {
  const join = (...parts: string[]): string => (
    platform === 'win32' ? path.win32.join(...parts) : path.posix.join(...parts)
  )
  const root = platform === 'win32'
    ? join(appData ?? join(home, 'AppData', 'Roaming'), 'DeepSeek Gestalt')
    : platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'DeepSeek Gestalt')
      : join(home, '.config', 'DeepSeek Gestalt')
  return join(root, LAUNCH_DIRECTORY_NAME)
}

/**
 * Create the Launch Directory if it is missing.
 * @param home - operating-system home directory.
 * @param platform - Node platform string.
 * @param appData - Windows APPDATA, when present.
 * @returns absolute Launch Directory path.
 */
export function ensureLaunchDirectory(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  appData: string | undefined = process.env.APPDATA,
): string {
  const dir = launchDirectory(home, platform, appData)
  mkdirSync(dir, { recursive: true })
  return dir
}
