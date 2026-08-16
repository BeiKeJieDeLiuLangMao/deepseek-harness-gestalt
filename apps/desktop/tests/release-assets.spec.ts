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
    const unpacked = join(mac, 'mac-arm64', 'DeepSeek Gestalt.app', 'Contents', 'Resources')
    await mkdir(mac)
    await mkdir(win)
    await mkdir(unpacked, { recursive: true })
    await Promise.all([
      writeFile(join(root, 'latest-mac.yml'), 'version: 0.1.0'),
      writeFile(join(win, 'latest.yml'), 'version: 0.1.0'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg'), 'dmg'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg.blockmap'), 'blockmap'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip'), 'zip'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip.blockmap'), 'blockmap'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg'), 'dmg'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg.blockmap'), 'blockmap'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip'), 'zip'),
      writeFile(join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip.blockmap'), 'blockmap'),
      writeFile(join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe'), 'exe'),
      writeFile(join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe.blockmap'), 'blockmap'),
      writeFile(join(win, 'builder-debug.yml'), 'ignored'),
      writeFile(join(unpacked, 'cordis.patch.yml'), 'internal'),
    ])
    expect(await releaseAssetPaths(root, '0.1.0')).toEqual([
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.dmg.blockmap'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-arm64.zip.blockmap'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.dmg.blockmap'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip'),
      join(mac, 'DeepSeek-Gestalt-0.1.0-x64.zip.blockmap'),
      join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe'),
      join(win, 'DeepSeekGestalt-Setup-0.1.0-x64.exe.blockmap'),
      join(win, 'latest.yml'),
      join(root, 'latest-mac.yml'),
    ].sort())
  })

  it('lists every missing updater or installer asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    await writeFile(join(root, 'latest-mac.yml'), 'version: 0.1.0')
    await expect(releaseAssetPaths(root, '0.1.0')).rejects.toThrow(
      'DeepSeek-Gestalt-0.1.0-arm64.dmg, DeepSeek-Gestalt-0.1.0-arm64.dmg.blockmap',
    )
  })

  it('rejects unexpected publishable files and mismatched feed versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    await writeFile(join(root, 'latest-mac.yml'), 'version: 0.2.0')
    await writeFile(join(root, 'DeepSeek-Gestalt-0.0.9-arm64.zip'), 'stale')
    await expect(releaseAssetPaths(root, '0.1.0')).rejects.toThrow('unexpected')
  })

  it('rejects updater feeds for another Desktop Bundle version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-assets-'))
    const artifact = join(root, 'candidate')
    await mkdir(artifact)
    const files = [
      'DeepSeek-Gestalt-0.1.0-arm64.dmg',
      'DeepSeek-Gestalt-0.1.0-arm64.dmg.blockmap',
      'DeepSeek-Gestalt-0.1.0-arm64.zip',
      'DeepSeek-Gestalt-0.1.0-arm64.zip.blockmap',
      'DeepSeek-Gestalt-0.1.0-x64.dmg',
      'DeepSeek-Gestalt-0.1.0-x64.dmg.blockmap',
      'DeepSeek-Gestalt-0.1.0-x64.zip',
      'DeepSeek-Gestalt-0.1.0-x64.zip.blockmap',
      'DeepSeekGestalt-Setup-0.1.0-x64.exe',
      'DeepSeekGestalt-Setup-0.1.0-x64.exe.blockmap',
    ]
    await Promise.all(files.map(file => writeFile(join(artifact, file), 'asset')))
    await writeFile(join(root, 'latest-mac.yml'), 'version: 0.2.0')
    await writeFile(join(artifact, 'latest.yml'), 'version: 0.1.0')
    await expect(releaseAssetPaths(root, '0.1.0')).rejects.toThrow(
      'latest-mac.yml version 0.2.0 does not match 0.1.0',
    )
  })
})
