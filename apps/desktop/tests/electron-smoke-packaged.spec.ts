import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appBin = process.env.DSH_PACKAGED_APP_BIN ?? join(
  import.meta.dirname, '..', 'release', 'mac-arm64', 'DeepSeek Gestalt.app',
  'Contents', 'MacOS', 'DeepSeek Gestalt',
)

/** Operated-identity fixture values that never reach a live service endpoint. */
const platformEnv = {
  DSH_PLATFORM_ORIGIN: 'https://platform.invalid',
  DSH_PLATFORM_CALLBACK_URL: 'https://platform.invalid/v1/account/oauth/github/callback',
  DSH_PLATFORM_GITHUB_CLIENT_ID: 'desktop-smoke',
  DSH_PLATFORM_CREDENTIAL_REFERENCE: 'credentials://desktop-smoke',
  DSH_PLATFORM_DATABASE_IDENTITY: 'desktop-smoke',
  DSH_PLATFORM_IDENTITY_NAMESPACE: 'desktop-smoke',
} as const

describe.skipIf(process.env.DSH_DESKTOP_SMOKE !== '1' || !existsSync(appBin))(
  'packed Desktop Host smoke',
  () => {
    it('refuses a packaged composition without the operated identity before Host startup', async () => {
      await expect(runPackagedConfigFailure()).resolves.toContain('production origin is required')
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

async function runPackagedConfigFailure(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gestalt-pack-config-'))
  const child = spawn(appBin, [`--user-data-dir=${join(dir, 'electron-user-data')}`], {
    env: {
      ...process.env,
      APPDATA: join(dir, 'app-data'),
      DSH_HOME: join(dir, 'dsh-home'),
      HOME: join(dir, 'user-home'),
      USERPROFILE: join(dir, 'user-home'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const onData = (chunk: Buffer): void => { output += chunk.toString() }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  const exitCode = await new Promise<number | null>((resolve) => { child.once('exit', resolve) })
  expect(exitCode).not.toBe(0)
  expect(output).not.toContain('host http://127.0.0.1:')
  return output
}

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
  const child = spawn(appBin, [`--user-data-dir=${join(dir, 'electron-user-data')}`], {
    env: {
      ...process.env,
      APPDATA: appData,
      DSH_HOME: dshHome,
      DSH_DESKTOP_SMOKE: '1',
      DSH_DESKTOP_SMOKE_FILE: log,
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
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
