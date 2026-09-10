import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { createWorkspaceGitCommand, DEFAULT_WORKSPACE_GIT_TIMEOUT_MS } from '../src/git.ts'
import WorkspaceController from '../src/index.ts'

const roots: Context[] = []
const temps: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true })
})

async function waitGone(pid: number, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`pid ${pid} still alive after ${timeoutMs}ms`)
}

function stageGit(script: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-git-timeout-')))
  temps.push(root)
  chmodSync(root, 0o700)
  const binDir = join(root, 'bin')
  mkdirSync(binDir, { recursive: true })
  chmodSync(binDir, 0o700)
  writeFileSync(join(binDir, 'git'), ['#!/usr/bin/env node', script, ''].join('\n'), { mode: 0o700 })
  return binDir
}

async function withScopedPath<T>(binDir: string, run: () => Promise<T>): Promise<T> {
  const previousPath = process.env.PATH
  process.env.PATH = `${binDir}:${previousPath ?? ''}`
  try {
    return await run()
  } finally {
    process.env.PATH = previousPath
  }
}

class RecordingLocalSubprocess extends LocalSubprocessRuntime {
  lastPid: number | undefined

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const handle = super.spawn(spec)
    this.lastPid = handle.pid
    return handle
  }
}

async function withLocalGit(
  script: string,
  timeoutMs: number,
  run: (git: ReturnType<typeof createWorkspaceGitCommand>, subprocess: RecordingLocalSubprocess) => Promise<void>,
): Promise<void> {
  await withScopedPath(stageGit(script), async () => {
    const ctx = new Context()
    roots.push(ctx)
    await ctx.plugin(RecordingLocalSubprocess)
    const subprocess = ctx.subprocess as RecordingLocalSubprocess
    const git = createWorkspaceGitCommand(ctx, process.cwd(), timeoutMs)
    await run(git, subprocess)
  })
}

describe('createWorkspaceGitCommand Host deadline', () => {
  it.skipIf(process.platform === 'win32')(
    'times out a hanging Git spawn without a caller abort and reaps the process tree',
    { timeout: 8_000 },
    async () => {
      await withLocalGit('setInterval(() => {}, 60_000)', 400, async (git, subprocess) => {
        const failure = await git('git', ['remote', 'get-url', 'origin'], new AbortController().signal)
          .then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).toMatch(/timed out after 400ms/)
        expect(subprocess.lastPid).toBeGreaterThan(0)
        await waitGone(subprocess.lastPid!)
      })
    },
  )

  it.skipIf(process.platform === 'win32')('returns origin from a fast Git without killing it', async () => {
    await withLocalGit('process.stdout.write("https://github.com/o/r.git\\n")', 5_000, async (git, subprocess) => {
      await expect(git('git', ['remote', 'get-url', 'origin'], new AbortController().signal))
        .resolves.toEqual({ stdout: 'https://github.com/o/r.git\n', stderr: '' })
      expect(subprocess.lastPid).toBeGreaterThan(0)
      await waitGone(subprocess.lastPid!)
    })
  })

  it.skipIf(process.platform === 'win32')(
    'keeps caller abort distinct from the Host deadline',
    { timeout: 8_000 },
    async () => {
      await withLocalGit('setInterval(() => {}, 60_000)', 5_000, async (git, subprocess) => {
        const abort = new AbortController()
        const pending = git('git', ['remote', 'get-url', 'origin'], abort.signal)
        await new Promise(resolve => setTimeout(resolve, 80))
        abort.abort()
        const failure = await pending.then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).not.toMatch(/timed out after/)
        expect(subprocess.lastPid).toBeGreaterThan(0)
        await waitGone(subprocess.lastPid!)
      })
    },
  )

  it('resolves omitted and partial config while rejecting a Host timeout outside the Node timer bound', () => {
    const ctx = new Context()
    expect(WorkspaceController.Config.parse(undefined)).toEqual({
      gitTimeoutMs: DEFAULT_WORKSPACE_GIT_TIMEOUT_MS,
    })
    expect(WorkspaceController.Config.parse({})).toEqual({
      gitTimeoutMs: DEFAULT_WORKSPACE_GIT_TIMEOUT_MS,
    })
    expect(WorkspaceController.Config.parse({ gitTimeoutMs: 5_000 })).toEqual({
      gitTimeoutMs: 5_000,
    })
    expect(() => createWorkspaceGitCommand(ctx, process.cwd(), 0)).toThrow(/timeoutMs/)
    expect(() => createWorkspaceGitCommand(ctx, process.cwd(), MAX_TIMER_DELAY_MS + 1)).toThrow(/timeoutMs/)
    expect(() => WorkspaceController.Config.parse({ gitTimeoutMs: 0 })).toThrow()
    expect(() => WorkspaceController.Config.parse({ gitTimeoutMs: MAX_TIMER_DELAY_MS + 1 })).toThrow()
  })
})
