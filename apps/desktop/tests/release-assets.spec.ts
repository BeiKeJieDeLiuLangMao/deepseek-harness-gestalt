import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseAssetPaths } from '../scripts/release-assets.mjs'

describe('releaseAssetPaths', () => {
  it('includes the complete versioned updater set without shell globs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    const mac = join(root, 'gestalt-mac-arm64')
    const win = join(root, 'gestalt-win-x64')
    await mkdir(mac)
    await mkdir(win)
    await Promise.all([
      writeFile(join(root, 'latest-mac.yml'), 'feed'),
      writeFile(join(win, 'latest.yml'), 'feed'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg'), 'dmg'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip'), 'zip'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg'), 'dmg'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip'), 'zip'),
      writeFile(join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe'), 'exe'),
      writeFile(join(win, 'builder-debug.yml'), 'ignored'),
    ])
    expect(await releaseAssetPaths(root, '0.1.0')).toEqual([
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip'),
      join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe'),
      join(win, 'latest.yml'),
      join(root, 'latest-mac.yml'),
    ].sort())
  })

  it('lists every missing updater or installer asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    await writeFile(join(root, 'latest-mac.yml'), 'feed')
    await expect(releaseAssetPaths(root, '0.1.0')).rejects.toThrow(
      'DeepSeek-Gestalt-0.1.0-arm64.dmg, DeepSeek-Gestalt-0.1.0-arm64.zip, DeepSeek-Gestalt-0.1.0-x64.dmg, DeepSeek-Gestalt-0.1.0-x64.zip, DeepSeekGestalt-Setup-0.1.0-x64.exe, latest.yml',
    )
  })
})
