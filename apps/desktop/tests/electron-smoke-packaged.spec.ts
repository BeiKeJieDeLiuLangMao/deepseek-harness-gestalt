import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appBin = join(
  import.meta.dirname,
  '..',
  'release',
  'mac-arm64',
  'DeepSeek Gestalt.app',
  'Contents',
  'MacOS',
  'DeepSeek Gestalt',
)

describe.skipIf(process.env.DSH_DESKTOP_SMOKE !== '1' || !existsSync(appBin))(
  'packed Desktop Host smoke',
  () => {
    it('loads __DSH_BOOT__ from the packaged official Node + dsh snapshot', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'gestalt-pack-smoke-'))
      const log = join(dir, 'smoke.log')
      await writeFile(log, '')
      const child = spawn(appBin, [], {
        env: {
          ...process.env,
          DSH_DESKTOP_SMOKE: '1',
          DSH_DESKTOP_SMOKE_FILE: log,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const electronExited = new Promise<void>((resolve) => {
        child.once('exit', () => { resolve() })
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
        if (text.includes('error ')) {
          child.kill()
          throw new Error(text)
        }
        await new Promise((resolve) => { setTimeout(resolve, 250) })
      }
      child.kill()
      throw new Error('packed smoke timed out\n' + (await readFile(log, 'utf8')))
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
