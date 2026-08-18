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

describe.skipIf(process.env.DSH_DESKTOP_SMOKE !== '1' || !existsSync(appBin))(
  'packed Desktop Host smoke',
  () => {
    it('loads the packaged Desktop composition with an inactive updater', async () => {
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
    }, 120_000)
  },
)

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
