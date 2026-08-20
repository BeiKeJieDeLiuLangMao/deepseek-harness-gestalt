import { mkdir, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyTree, directoryLinkSpec } from '../scripts/copy-tree.mjs'

describe('copyTree', () => {
  it('uses privilege-free directory junctions on Windows', () => {
    const windows = directoryLinkSpec('C:\\bundle\\link', 'C:\\bundle\\target', 'win32')
    expect(windows.type).toBe('junction')
    expect(windows.target).toContain('target')
    expect(directoryLinkSpec('/bundle/link', '/bundle/target', 'darwin')).toEqual({
      target: 'target',
      type: 'dir',
    })
  })

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

  it('rewrites an absolute in-tree symlink to stay inside the copied tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-copy-internal-'))
    const src = join(root, 'src')
    const dest = join(root, 'dest')
    await mkdir(join(src, 'target'), { recursive: true })
    await writeFile(join(src, 'target', 'payload.txt'), 'payload')
    await symlink(join(src, 'target'), join(src, 'absolute-link'))

    await copyTree(src, dest)

    // Windows junctions read back an absolute target; compare the resolved
    // referent instead of one platform's readlink spelling.
    expect(await realpath(join(dest, 'absolute-link'))).toBe(await realpath(join(dest, 'target')))
    expect(await readFile(join(dest, 'absolute-link', 'payload.txt'), 'utf8')).toBe('payload')
  })

  it('copies an in-tree file link as a regular file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestalt-copy-file-'))
    const src = join(root, 'src')
    const dest = join(root, 'dest')
    await mkdir(src)
    await writeFile(join(src, 'target.txt'), 'payload')
    await symlink(join(src, 'target.txt'), join(src, 'link.txt'))

    await copyTree(src, dest)

    expect(await readFile(join(dest, 'link.txt'), 'utf8')).toBe('payload')
    await expect(readlink(join(dest, 'link.txt'))).rejects.toThrow()
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
