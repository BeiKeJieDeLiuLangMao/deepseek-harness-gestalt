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
})
