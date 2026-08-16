import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyTree } from '../scripts/copy-tree.mjs'

describe('copyTree', () => {
  it('materializes a symlink that points outside the source tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-copy-'))
    const src = join(root, 'src')
    const dest = join(root, 'dest')
    const outside = join(root, 'outside.txt')
    await mkdir(src)
    await writeFile(outside, 'payload')
    await symlink(outside, join(src, 'link.txt'))
    await copyTree(src, dest)
    expect(await readFile(join(dest, 'link.txt'), 'utf8')).toBe('payload')
  })

  it('stops materializing when an outbound package link cycles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-copy-cycle-'))
    const src = join(root, 'src')
    const dest = join(root, 'dest')
    const outside = join(root, 'outside')
    await mkdir(src)
    await mkdir(join(outside, 'node_modules'), { recursive: true })
    await writeFile(join(outside, 'payload.txt'), 'payload')
    await symlink(outside, join(outside, 'node_modules', 'loop'))
    await symlink(outside, join(src, 'package'))

    await copyTree(src, dest)

    expect(await readFile(join(dest, 'package', 'payload.txt'), 'utf8')).toBe('payload')
    expect(await readFile(join(dest, 'package', 'node_modules', 'loop', 'payload.txt'), 'utf8')).toBe('payload')
  })
})
