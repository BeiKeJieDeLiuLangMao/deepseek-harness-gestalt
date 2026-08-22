import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startKeylessDesktopProvider } from './keyless-provider.ts'

const appBin = process.env.DSH_PACKAGED_APP_BIN ?? join(
  import.meta.dirname, '..', 'release', 'mac-arm64', 'DeepSeek Gestalt.app',
  'Contents', 'MacOS', 'DeepSeek Gestalt',
)

/** Development Platform environment values that never reach a live service endpoint. */
const platformEnv = {
  DSH_PLATFORM_ENV: 'development',
  DSH_PLATFORM_DEVELOPMENT_ORIGIN: 'https://platform.invalid',
  DSH_PLATFORM_DEVELOPMENT_CALLBACK_URL: 'https://platform.invalid/v1/account/oauth/github/callback',
  DSH_PLATFORM_DEVELOPMENT_GITHUB_CLIENT_ID: 'desktop-smoke',
  DSH_PLATFORM_DEVELOPMENT_CREDENTIAL_REFERENCE: 'credentials://desktop-smoke',
  DSH_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY: 'desktop-smoke',
  DSH_PLATFORM_DEVELOPMENT_IDENTITY_NAMESPACE: 'desktop-smoke',
  DSH_PLATFORM_PRODUCTION_ORIGIN: 'https://platform-production.invalid',
  DSH_PLATFORM_PRODUCTION_CALLBACK_URL: 'https://platform-production.invalid/v1/account/oauth/github/callback',
  DSH_PLATFORM_PRODUCTION_GITHUB_CLIENT_ID: 'desktop-smoke-production',
  DSH_PLATFORM_PRODUCTION_CREDENTIAL_REFERENCE: 'credentials://desktop-smoke-production',
  DSH_PLATFORM_PRODUCTION_DATABASE_IDENTITY: 'desktop-smoke-production',
  DSH_PLATFORM_PRODUCTION_IDENTITY_NAMESPACE: 'desktop-smoke-production',
} as const

describe.skipIf(process.env.DSH_DESKTOP_SMOKE !== '1' || !existsSync(appBin))(
  'packed Desktop Host smoke',
  () => {
    it('boots the packaged composition without platform environment', async () => {
      await runPackagedSmoke({})
    }, 120_000)

    it('drains the Remote Access relay offline across packaged shutdown', async () => {
      await runPackagedSmoke(platformEnv, (finalLog) => {
        expect(finalLog).toContain('relay production-gate {"connected":false}')
        expect(finalLog).toContain('relay sleep {"connected":false,"stopReason":"sleep"}')
        expect(finalLog).toContain('relay mobile-access-disabled {"connected":false,"stopReason":"mobile-access-disabled"}')
        expect(finalLog).toContain('relay window-close {"connected":false,"stopReason":"window-close"}')
        expect(finalLog).toContain('relay quit {"connected":false,"stopReason":"quit"}')
      })
    }, 120_000)
  },
)

/**
 * Run the packaged app under an isolated home until smoke completion.
 * @param platform - Platform environment entries; empty means the app boots with no Platform configuration.
 * @param assertShutdownLog - optional assertions over the final smoke log after process exit.
 */
async function runPackagedSmoke(
  platform: Record<string, string>,
  assertShutdownLog?: (finalLog: string) => void,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'gestalt-pack-smoke-'))
  const log = join(dir, 'smoke.log')
  const dshHome = join(dir, 'dsh-home')
  const userHome = join(dir, 'user-home')
  const appData = join(dir, 'app-data')
  await Promise.all([mkdir(dshHome), mkdir(userHome), mkdir(appData)])
  await writeFile(log, '')
  const provider = await startKeylessDesktopProvider()
  try {
    const child = spawn(appBin, [`--user-data-dir=${join(dir, 'electron-user-data')}`], {
      env: {
        ...process.env,
        APPDATA: appData,
        DSH_HOME: dshHome,
        DSH_DESKTOP_SMOKE: '1',
        DSH_DESKTOP_SMOKE_FILE: log,
        DEEPSEEK_API_KEY: 'keyless-desktop-packaged-smoke',
        DEEPSEEK_BASE_URL: provider.origin,
        ELECTRON_ENABLE_LOGGING: '1',
        ...platform,
        HOME: userHome,
        USERPROFILE: userHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const onData = (chunk: Buffer): void => { output += chunk.toString() }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    let exitCode: number | null = null
    const electronExited = new Promise<void>((resolve) => {
      child.once('exit', (code) => {
        exitCode = code
        resolve()
      })
    })
    const deadline = Date.now() + 80_000
    while (Date.now() < deadline) {
      const text = await readFile(log, 'utf8')
      if (text.split('\n').includes('ok')) {
        const host = text.match(/host http:\/\/127\.0\.0\.1:\d+ pid (\d+)/)
        expect(host).not.toBeNull()
        expect(text).toContain('companion entry search hit {"type":"session-search"')
        expect(text).toContain('desktop-companion-smoke-indexed-needle')
        expect(text).toContain('companion entry search no-hit {"type":"session-search"')
        await electronExited
        const finalText = await readFile(log, 'utf8')
        assertShutdownLog?.(finalText)
        const pid = Number(host?.[1])
        await expect.poll(() => processExists(pid), { timeout: 5_000 }).toBe(false)
        return
      }
      if (text.includes('missing Desktop Session Surface evidence') || text.includes('error ')) {
        child.kill()
        throw new Error(text + '\n' + output.slice(-4000))
      }
      if (exitCode !== null) {
        throw new Error(
          `packed smoke exited ${String(exitCode)} before ok\n${text}\n${output.slice(-4000)}`,
        )
      }
      await new Promise((resolve) => { setTimeout(resolve, 250) })
    }
    child.kill()
    throw new Error(
      'packed smoke timed out\n' + (await readFile(log, 'utf8')) + '\n' + output.slice(-4000),
    )
  } finally {
    await provider.close()
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
