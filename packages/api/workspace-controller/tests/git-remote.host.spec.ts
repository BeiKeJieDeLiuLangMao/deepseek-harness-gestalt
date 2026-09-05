import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import WorkspaceController from '../src/index.ts'
import { createWorkspaceGitCommand } from '../src/git.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(options: {
  readonly workspaceGitCommand?: NativeCommandRunner
  readonly subprocess?: { spawn(spec: SubprocessSpawnSpec): SubprocessHandle }
} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-git-remote-')))
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  if (options.subprocess !== undefined) ctx.provide('subprocess', options.subprocess as never)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  const controller = new WorkspaceController(ctx, options.workspaceGitCommand === undefined
    ? {}
    : { workspaceGitCommand: options.workspaceGitCommand })
  return { controller, ctx, root }
}

function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync('git', [...args], { cwd, stdio: 'ignore' })
}

function collected(text: string, lossy = false): SubprocessHandle['collected'] {
  return {
    stdout: { readFrom: () => ({ text, nextOffset: text.length, lossy }) },
    stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
  }
}

function handle(options: {
  readonly outcome: SubprocessOutcome
  readonly collected: SubprocessHandle['collected']
}): SubprocessHandle {
  return {
    pid: 1,
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    collected: options.collected,
    done: Promise.resolve(options.outcome),
    terminate() {},
    waitForExit() { return Promise.resolve(true) },
  }
}

describe('WorkspaceController.gitRemote', () => {
  it('reads origin from a real checkout through argv Git', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runNativeCommand })
    const path = stageDir(root, 'origin')
    git(path, ['init'])
    git(path, ['remote', 'add', 'origin', 'https://github.com/o/r.git'])
    const created = await controller.create({ path })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({ remoteUrl: 'https://github.com/o/r.git' })
  })

  it('returns no remoteUrl for a checkout without origin and a non-Git Workspace', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runNativeCommand })
    const gitless = await controller.create({ path: stageDir(root, 'plain') })
    const noOriginPath = stageDir(root, 'no-origin')
    git(noOriginPath, ['init'])
    const noOrigin = await controller.create({ path: noOriginPath })
    await expect(controller.gitRemote({ workspaceId: gitless.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
    await expect(controller.gitRemote({ workspaceId: noOrigin.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
  })

  it('rejects an unknown Workspace without spawning Git', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller } = await harness({ workspaceGitCommand: command })
    await expect(controller.gitRemote({ workspaceId: 'missing' as WorkspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/not-found' })
    expect(command).not.toHaveBeenCalled()
  })

  it('passes workspace path as -C and origin argv without a shell string', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockResolvedValue({ stdout: 'https://github.com/o/r.git\n', stderr: '' })
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'wired') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({ remoteUrl: 'https://github.com/o/r.git' })
    expect(command.mock.calls[0]?.slice(0, 2)).toEqual([
      'git',
      ['-C', created.workspace.path, 'remote', 'get-url', 'origin'],
    ])
  })

  it('maps a non-zero Git exit without origin to an unbound Workspace', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(new Error('workspace Git exited with code 2'))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'nonzero') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
  })

  it('maps caller abort to gateway/cancelled', async () => {
    const abort = new AbortController()
    const command = vi.fn<NativeCommandRunner>(async () => {
      abort.abort()
      throw new Error('aborted')
    })
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'abort') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, abort.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
  })

  it('maps AbortSignal.timeout during a hanging Git runner to gateway/cancelled', async () => {
    const command = vi.fn<NativeCommandRunner>(async (_command, _args, signal) => {
      await new Promise<void>((_resolve, reject) => {
        const fail = (): void => { reject(new Error('aborted')) }
        if (signal.aborted) fail()
        else signal.addEventListener('abort', fail, { once: true })
      })
      return { stdout: '', stderr: '' }
    })
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'timeout') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, AbortSignal.timeout(30)))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
  })

  it('does not spawn Git when the caller signal is already aborted', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'preabort') })
    const abort = new AbortController()
    abort.abort()
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, abort.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
    expect(command).not.toHaveBeenCalled()
  })

  it('maps bounded-output overflow to workspace/git-failed', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(new Error('workspace Git output exceeded the bounded capture'))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'overflow') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('fails closed when the subprocess service is not composed', async () => {
    const { controller, root } = await harness()
    const created = await controller.create({ path: stageDir(root, 'nosub') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('runs production Git argv through subprocess with a 1 MiB capture', async () => {
    const spawns: SubprocessSpawnSpec[] = []
    const { controller, root } = await harness({
      subprocess: {
        spawn(spec) {
          spawns.push(spec)
          return handle({
            outcome: { exitCode: 0, signal: null },
            collected: collected('https://github.com/o/r.git\n'),
          })
        },
      },
    })
    const created = await controller.create({ path: stageDir(root, 'prod') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({ remoteUrl: 'https://github.com/o/r.git' })
    expect(spawns[0]?.argv).toEqual(['git', '-C', created.workspace.path, 'remote', 'get-url', 'origin'])
    expect(spawns[0]?.stdio).toEqual({
      stdin: 'ignore',
      stdout: { maxBytes: 1024 * 1024 },
      stderr: { maxBytes: 1024 * 1024 },
    })
  })

  it('rejects a Typert-legal extra wire field at the Host method, not by spawning Git', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller } = await harness({ workspaceGitCommand: command })
    await expect(controller.gitRemote(
      { workspaceId: 'missing' as WorkspaceId, extra: true } as { workspaceId: WorkspaceId },
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'workspace/not-found' })
    expect(command).not.toHaveBeenCalled()
  })
})

describe('createWorkspaceGitCommand', () => {
  it('refuses a non-git executable', async () => {
    const ctx = new Context()
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    await expect(run('bash', ['-c', 'true'], new AbortController().signal))
      .rejects.toThrow(/rejects executable/)
  })

  it('maps a lossy capture to overflow', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return handle({
          outcome: { exitCode: 0, signal: null },
          collected: collected('x', true),
        })
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    await expect(run('git', ['remote', 'get-url', 'origin'], new AbortController().signal))
      .rejects.toThrow('workspace Git output exceeded the bounded capture')
  })
})
