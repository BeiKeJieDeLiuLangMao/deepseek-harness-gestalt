import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertTandemQualificationHost,
  isolateTandemHost,
  tandemHostIsWine,
  tandemQualificationFailure,
  tandemQualificationPlatform,
  withTandemLauncherPath,
} from '@deepseek-ai/dsh-browser-runtime-tandem'

describe('Tandem host isolation', () => {
  it('names only macOS and Windows as qualification platforms', () => {
    expect(tandemQualificationPlatform('darwin')).toBe('darwin')
    expect(tandemQualificationPlatform('win32')).toBe('win32')
    expect(() => tandemQualificationPlatform('linux')).toThrow(
      'linux: tandemQualificationPlatform: Tandem Browser qualification supports macOS and Windows only',
    )
  })

  it('isolates macOS HOME, ~/.tandem, PATH, and native-host directories', () => {
    const isolation = isolateTandemHost('/tmp/dsh-tandem-macos', {
      platform: 'darwin',
      path: '/opt/homebrew/bin:/usr/bin',
    })
    expect(isolation).toMatchObject({
      platform: 'darwin',
      platformName: 'macOS',
      home: '/tmp/dsh-tandem-macos',
      dataDir: '/tmp/dsh-tandem-macos/.tandem',
      userDataDir: '/tmp/dsh-tandem-macos/Library/Application Support/Tandem Browser',
      tokenFile: '/tmp/dsh-tandem-macos/.tandem/api-token',
      env: {
        HOME: '/tmp/dsh-tandem-macos',
        PATH: '/opt/homebrew/bin:/usr/bin',
      },
    })
    expect(isolation.env.USERPROFILE).toBeUndefined()
    expect(isolation.env.APPDATA).toBeUndefined()
    expect(isolation.env.LOCALAPPDATA).toBeUndefined()
    expect(isolation.env.PATHEXT).toBeUndefined()
    expect(isolation.nativeHostDirs).toEqual([
      '/tmp/dsh-tandem-macos/Library/Application Support/Google/Chrome/NativeMessagingHosts',
      '/tmp/dsh-tandem-macos/Library/Application Support/Tandem Browser/NativeMessagingHosts',
    ])
  })

  it('isolates Windows USERPROFILE, APPDATA, LOCALAPPDATA, PATH, PATHEXT, and native-host directories', () => {
    const isolation = isolateTandemHost('C:\\Users\\dsh-tandem', {
      platform: 'win32',
      path: 'C:\\Windows\\System32',
      pathExt: '.EXE;.CMD',
    })
    expect(isolation.platform).toBe('win32')
    expect(isolation.platformName).toBe('Windows')
    expect(isolation.home).toBe('C:\\Users\\dsh-tandem')
    expect(isolation.dataDir).toBe(join('C:\\Users\\dsh-tandem', 'AppData', 'Roaming', 'Tandem Browser'))
    expect(isolation.userDataDir).toBe(join('C:\\Users\\dsh-tandem', 'AppData', 'Local', 'Tandem Browser'))
    expect(isolation.tokenFile).toBe(join(isolation.dataDir, 'api-token'))
    expect(isolation.env).toEqual({
      HOME: 'C:\\Users\\dsh-tandem',
      USERPROFILE: 'C:\\Users\\dsh-tandem',
      APPDATA: join('C:\\Users\\dsh-tandem', 'AppData', 'Roaming'),
      LOCALAPPDATA: join('C:\\Users\\dsh-tandem', 'AppData', 'Local'),
      PATH: 'C:\\Windows\\System32',
      PATHEXT: '.EXE;.CMD',
    })
    expect(isolation.nativeHostDirs).toEqual([
      join('C:\\Users\\dsh-tandem', 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts'),
    ])
  })

  it('prepends an absolute Tandem launcher directory to PATH', () => {
    const isolation = withTandemLauncherPath(
      isolateTandemHost('/tmp/dsh-tandem-path', { platform: 'darwin', path: '/usr/bin' }),
      '/opt/tandem/bin/tandem',
    )
    expect(isolation.env.PATH).toBe(`/opt/tandem/bin${delimiter}/usr/bin`)
    expect(withTandemLauncherPath(isolation, 'tandem').env.PATH).toBe(isolation.env.PATH)
    expect(withTandemLauncherPath(
      isolateTandemHost('/tmp/dsh-tandem-empty-path', { platform: 'darwin', path: '' }),
      '/opt/tandem/bin/tandem',
    ).env.PATH).toBe('/opt/tandem/bin')
  })

  it('inherits ambient PATH and PATHEXT when isolation overrides are omitted', () => {
    const previousPath = process.env.PATH
    const previousPathExt = process.env.PATHEXT
    delete process.env.PATH
    delete process.env.PATHEXT
    try {
      expect(isolateTandemHost('/tmp/dsh-tandem-ambient-macos', { platform: 'darwin' }).env.PATH).toBe('')
      const windows = isolateTandemHost('C:\\Users\\ambient', { platform: 'win32' })
      expect(windows.env.PATH).toBe('')
      expect(windows.env.PATHEXT).toBe('.COM;.EXE;.BAT;.CMD')
      process.env.PATH = '/ambient/bin'
      process.env.PATHEXT = '.EXE'
      expect(isolateTandemHost('/tmp/dsh-tandem-ambient-macos', { platform: 'darwin' }).env.PATH).toBe('/ambient/bin')
      expect(isolateTandemHost('C:\\Users\\ambient', { platform: 'win32' }).env.PATHEXT).toBe('.EXE')
    } finally {
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
      if (previousPathExt === undefined) delete process.env.PATHEXT
      else process.env.PATHEXT = previousPathExt
    }
  })

  it('treats Wine as a diagnostic host and refuses Windows qualification', () => {
    expect(tandemHostIsWine({})).toBe(false)
    expect(tandemHostIsWine({ WINEPREFIX: '/tmp/wine' })).toBe(true)
    expect(tandemHostIsWine({ DSH_TANDEM_WINE: '1' })).toBe(true)
    expect(() => assertTandemQualificationHost({ WINEPREFIX: '/tmp/wine' })).toThrow(
      'Windows: pnpm run check:windows-wine: Wine is diagnostic only and cannot qualify the real Tandem Browser; native Windows CI owns the platform matrix',
    )
    assertTandemQualificationHost({})
  })

  it('names the platform, command, and error on a qualification failure', () => {
    const cause = new Error('ENOENT')
    const failure = tandemQualificationFailure('macOS', 'DSH_TANDEM_BIN', cause)
    expect(failure.message).toBe('macOS: DSH_TANDEM_BIN: ENOENT')
    expect(failure.cause).toBe(cause)
  })
})
