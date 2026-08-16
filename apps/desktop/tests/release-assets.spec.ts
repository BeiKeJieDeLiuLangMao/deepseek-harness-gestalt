import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseAssetPaths } from '../scripts/release-assets.mjs'

describe('releaseAssetPaths', () => {
  it('includes the root macOS feed and nested installers without shell globs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    const mac = join(root, 'gestalt-mac-arm64')
    const win = join(root, 'gestalt-win-x64')
    await mkdir(mac)
    await mkdir(win)
    await Promise.all([
      writeFile(join(root, 'latest-mac.yml'), 'feed'),
      writeFile(join(mac, 'DeepSeek Gestalt.zip'), 'zip'),
      writeFile(join(win, 'DeepSeek Gestalt.exe'), 'exe'),
      writeFile(join(win, 'builder-debug.yml'), 'ignored'),
    ])
    expect(await releaseAssetPaths(root)).toEqual([
      join(mac, 'DeepSeek Gestalt.zip'),
      join(win, 'DeepSeek Gestalt.exe'),
      join(root, 'latest-mac.yml'),
    ].sort())
  })

  it('rejects a release set without the merged macOS feed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    await writeFile(join(root, 'DeepSeek Gestalt.exe'), 'exe')
    await expect(releaseAssetPaths(root)).rejects.toThrow('latest-mac.yml')
  })
})
