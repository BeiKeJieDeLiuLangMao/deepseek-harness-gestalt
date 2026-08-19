/**
 * Named macOS and Windows isolation for a real Tandem Browser child.
 * @module @deepseek-ai/dsh-browser-runtime-tandem/host
 */

import { delimiter, dirname, join } from 'node:path'

/** Hosts that may qualify a real Tandem Browser. Linux remains out of scope. */
export type TandemQualificationPlatform = 'darwin' | 'win32'

/** Isolated filesystem and environment used to launch one Tandem child. */
export interface TandemHostIsolation {
  /** Node platform id for the isolated host. */
  readonly platform: TandemQualificationPlatform
  /** User-facing host name used in qualification failures. */
  readonly platformName: 'macOS' | 'Windows'
  /** Isolated operating-system home. */
  readonly home: string
  /** Isolated Tandem config, token, and API-port directory. */
  readonly dataDir: string
  /** Isolated Electron Chromium user-data directory. */
  readonly userDataDir: string
  /** Isolated file where Tandem writes its generated API token. */
  readonly tokenFile: string
  /** Isolated native-messaging host directories the child may scan. */
  readonly nativeHostDirs: readonly string[]
  /** Explicit child environment layered over the scrubbed parent environment. */
  readonly env: Record<string, string>
}

/**
 * Reject a host that is not a named Tandem qualification platform.
 * @param platform - Node platform id, usually `process.platform`.
 * @returns `darwin` or `win32`.
 * @throws when the host is not macOS or Windows.
 */
export function tandemQualificationPlatform(
  platform: NodeJS.Platform = process.platform,
): TandemQualificationPlatform {
  if (platform === 'darwin' || platform === 'win32') return platform
  throw new Error(
    `${platform}: tandemQualificationPlatform: Tandem Browser qualification supports macOS and Windows only`,
  )
}

/**
 * Detect Wine or an explicit Wine diagnostic override.
 * @param env - environment mapping that may carry Wine markers.
 * @returns `true` when this process is a Wine diagnostic host.
 */
export function tandemHostIsWine(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WINEPREFIX !== undefined
    || env.WINELOADER !== undefined
    || env.DSH_TANDEM_WINE === '1'
}

/**
 * Name a real-Tandem failure with the host, command, and error.
 * @param platformName - `macOS` or `Windows`.
 * @param command - executable, Browser Runtime method, or documented gate that failed.
 * @param error - thrown value or diagnostic string.
 * @returns an error whose message is `<platform>: <command>: <detail>`.
 */
export function tandemQualificationFailure(
  platformName: 'macOS' | 'Windows',
  command: string,
  error: unknown,
): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`${platformName}: ${command}: ${detail}`, { cause: error })
}

/**
 * Refuse to treat Wine as a Windows qualification host.
 * @param env - environment mapping that may carry Wine markers.
 * @throws when Wine is detected.
 */
export function assertTandemQualificationHost(env: NodeJS.ProcessEnv = process.env): void {
  if (!tandemHostIsWine(env)) return
  throw tandemQualificationFailure(
    'Windows',
    'pnpm run check:windows-wine',
    'Wine is diagnostic only and cannot qualify the real Tandem Browser; native Windows CI owns the platform matrix',
  )
}

/**
 * Build one isolated Tandem home, data directory, native-host scan list, and child env.
 * @param home - empty directory used as the isolated operating-system home.
 * @param options - optional platform, PATH, and PATHEXT overrides for tests.
 * @returns isolation paths and the explicit child environment.
 */
export function isolateTandemHost(
  home: string,
  options: {
    platform?: NodeJS.Platform
    path?: string
    pathExt?: string
  } = {},
): TandemHostIsolation {
  const platform = tandemQualificationPlatform(options.platform)
  if (platform === 'win32') {
    const appData = join(home, 'AppData', 'Roaming')
    const localAppData = join(home, 'AppData', 'Local')
    const dataDir = join(appData, 'Tandem Browser')
    const userDataDir = join(localAppData, 'Tandem Browser')
    const nativeHostDirs = [join(localAppData, 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts')]
    const pathValue = options.path ?? process.env.PATH ?? ''
    const pathExt = options.pathExt ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD'
    return Object.freeze({
      platform,
      platformName: 'Windows',
      home,
      dataDir,
      userDataDir,
      tokenFile: join(dataDir, 'api-token'),
      nativeHostDirs,
      env: Object.freeze({
        HOME: home,
        USERPROFILE: home,
        APPDATA: appData,
        LOCALAPPDATA: localAppData,
        PATH: pathValue,
        PATHEXT: pathExt,
      }),
    })
  }

  const dataDir = join(home, '.tandem')
  const support = join(home, 'Library', 'Application Support')
  const userDataDir = join(support, 'Tandem Browser')
  const nativeHostDirs = [
    join(support, 'Google', 'Chrome', 'NativeMessagingHosts'),
    join(userDataDir, 'NativeMessagingHosts'),
  ]
  return Object.freeze({
    platform,
    platformName: 'macOS',
    home,
    dataDir,
    userDataDir,
    tokenFile: join(dataDir, 'api-token'),
    nativeHostDirs,
    env: Object.freeze({
      HOME: home,
      PATH: options.path ?? process.env.PATH ?? '',
    }),
  })
}

/**
 * Prepend the directory that contains a Tandem launcher to the isolated PATH.
 * @param isolation - host isolation whose PATH should prefer the launcher directory.
 * @param command - absolute or bare Tandem launcher.
 * @returns isolation with the launcher directory first on PATH.
 */
export function withTandemLauncherPath(isolation: TandemHostIsolation, command: string): TandemHostIsolation {
  if (!command.includes('/') && !command.includes('\\')) return isolation
  const directory = dirname(command)
  const pathValue = isolation.env.PATH
  const nextPath = pathValue === undefined || pathValue.length === 0
    ? directory
    : `${directory}${delimiter}${pathValue}`
  return Object.freeze({
    ...isolation,
    env: Object.freeze({ ...isolation.env, PATH: nextPath }),
  })
}
