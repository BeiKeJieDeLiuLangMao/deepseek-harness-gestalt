import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { WorkspaceReferenceRuntime } from '../src/runtime.ts'

const SIGNAL = new AbortController().signal

function fakeAgent(cwd: string | undefined): Agent {
  return { session: { header: { cwd } } } as Agent
}

describe('WorkspaceReferenceRuntime.search', () => {
  let dir: string
  let ctx: Context
  let fiber: Awaited<ReturnType<Context['plugin']>>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-wsref-rt-'))
    ctx = new Context()
    fiber = await ctx.plugin(LocalFileSystem, { cwd: dir })
  })

  afterEach(async () => {
    await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  it('returns indexed files from the agent cwd', async () => {
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src/a.ts'), 'a\n')
    const runtime = new WorkspaceReferenceRuntime(ctx, {
      maxIndexedFiles: 50,
      ignoreDirs: ['node_modules'],
    })
    const files = await runtime.search(fakeAgent(dir), SIGNAL)
    expect(files.map(entry => entry.relative).sort()).toEqual(['src', 'src/a.ts'])
  })

  it('returns an empty list when the session has no cwd', async () => {
    const runtime = new WorkspaceReferenceRuntime(ctx, {
      maxIndexedFiles: 50,
      ignoreDirs: [],
    })
    expect(await runtime.search(fakeAgent(undefined), SIGNAL)).toEqual([])
  })
})
