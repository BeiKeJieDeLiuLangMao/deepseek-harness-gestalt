import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeLatestMacFeeds, parseLatestMac } from '../scripts/merge-latest-mac.mjs'

describe('mergeLatestMacFeeds', () => {
  it('merges two per-arch feeds into one files list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-mac-'))
    await mkdir(join(root, 'gestalt-mac-arm64'))
    await mkdir(join(root, 'gestalt-mac-x64'))
    await writeFile(join(root, 'gestalt-mac-arm64', 'latest-mac.yml'), [
      'version: 0.1.0',
      'files:',
      '  - url: DeepSeek-Gestalt-0.1.0-arm64.zip',
      '    sha512: armsha',
      '    size: 10',
      'path: DeepSeek-Gestalt-0.1.0-arm64.zip',
      'sha512: armsha',
      "releaseDate: '2026-08-16'",
      '',
    ].join('\n'))
    await writeFile(join(root, 'gestalt-mac-x64', 'latest-mac.yml'), [
      'version: 0.1.0',
      'path: DeepSeek-Gestalt-0.1.0-x64.zip',
      'sha512: x64sha',
      'size: 11',
      '',
    ].join('\n'))
    const result = await mergeLatestMacFeeds(root)
    const merged = parseLatestMac(await readFile(result.out, 'utf8'))
    expect(merged.version).toBe('0.1.0')
    expect(merged.files.map(file => file.url).sort()).toEqual([
      'DeepSeek-Gestalt-0.1.0-arm64.zip',
      'DeepSeek-Gestalt-0.1.0-x64.zip',
    ])
  })
})
