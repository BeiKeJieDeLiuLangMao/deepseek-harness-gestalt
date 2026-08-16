import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureLaunchDirectory, LAUNCH_DIRECTORY_NAME } from '../src/launch-directory.ts'

describe('ensureLaunchDirectory', () => {
  it('creates the Launch Directory when it is missing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'gestalt-home-'))
    const dir = ensureLaunchDirectory(home, 'darwin')
    expect(dir.endsWith(LAUNCH_DIRECTORY_NAME)).toBe(true)
    expect((await stat(dir)).isDirectory()).toBe(true)
    await rm(home, { recursive: true, force: true })
  })
})
