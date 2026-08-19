import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { indexWorkspace } from '../src/files.ts'

const SIGNAL = new AbortController().signal

describe('indexWorkspace', () => {
  let dir: string
  let ctx: Context
  let fiber: Awaited<ReturnType<Context['plugin']>>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-wsref-'))
    ctx = new Context()
    fiber = await ctx.plugin(LocalFileSystem, { cwd: dir })
  })

  afterEach(async () => {
    await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  it('indexes files and directories, skipping ignore names and symlinks', async () => {
    await mkdir(join(dir, 'src'))
    await mkdir(join(dir, 'node_modules'))
    await writeFile(join(dir, 'src/a.ts'), 'a\n')
    await writeFile(join(dir, 'README.md'), 'r\n')
    await writeFile(join(dir, '.DS_Store'), 'x\n')
    await writeFile(join(dir, 'node_modules/pkg.js'), 'p\n')
    await symlink(join(dir, 'README.md'), join(dir, 'link.md'))
    const index = await indexWorkspace(ctx.fs, dir, {
      maxFiles: 50,
      ignoreDirs: ['node_modules'],
      ignoreFiles: ['.DS_Store'],
    }, SIGNAL)
    expect(index.truncated).toBe(false)
    expect(index.files.map(entry => `${entry.kind}:${entry.relative}`).sort()).toEqual([
      'dir:src',
      'file:README.md',
      'file:src/a.ts',
    ])
  })

  it('stops at the configured cap and reports truncation', async () => {
    await writeFile(join(dir, 'a.ts'), 'a\n')
    await writeFile(join(dir, 'b.ts'), 'b\n')
    await writeFile(join(dir, 'c.ts'), 'c\n')
    const index = await indexWorkspace(ctx.fs, dir, {
      maxFiles: 2,
      ignoreDirs: [],
      ignoreFiles: [],
    }, SIGNAL)
    expect(index.truncated).toBe(true)
    expect(index.files).toHaveLength(2)
  })

  it('stops before listing a queued child once the cap is already full', async () => {
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested/a.ts'), 'a\n')
    const index = await indexWorkspace(ctx.fs, dir, {
      maxFiles: 1,
      ignoreDirs: [],
      ignoreFiles: [],
    }, SIGNAL)
    expect(index.truncated).toBe(true)
    expect(index.files).toHaveLength(1)
  })

  it('skips a permission-denied directory and rethrows other list errors', async () => {
    const { FsError } = await import('@deepseek-ai/dsh-fs')
    const denied = {
      resolve: ctx.fs.resolve.bind(ctx.fs),
      listDir: async () => { throw new FsError('denied', 'FS_PERMISSION_DENIED') },
      lstat: ctx.fs.lstat.bind(ctx.fs),
    }
    await expect(indexWorkspace(denied as never, dir, {
      maxFiles: 10,
      ignoreDirs: [],
      ignoreFiles: [],
    }, SIGNAL)).resolves.toEqual({ files: [], truncated: false })

    const boom = {
      resolve: ctx.fs.resolve.bind(ctx.fs),
      listDir: async () => { throw new Error('io') },
      lstat: ctx.fs.lstat.bind(ctx.fs),
    }
    await expect(indexWorkspace(boom as never, dir, {
      maxFiles: 10,
      ignoreDirs: [],
      ignoreFiles: [],
    }, SIGNAL)).rejects.toThrow('io')
    await expect(indexWorkspace(ctx.fs, 'relative', {
      maxFiles: 10,
      ignoreDirs: [],
      ignoreFiles: [],
    }, SIGNAL)).resolves.toEqual({ files: [], truncated: false })
  })
})
