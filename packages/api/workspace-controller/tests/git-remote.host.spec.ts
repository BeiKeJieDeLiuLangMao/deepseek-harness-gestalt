import { execFile, execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import WorkspaceController from '../src/index.ts'
import { createWorkspaceGitCommand, workspaceGitFailureCode } from '../src/git.ts'
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

/** Matches production Git locale: child `LANG`/`LC_ALL=C` only, not the parent process. */
const runGitC: NativeCommandRunner = (command, args, signal) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], {
      encoding: 'utf8',
      signal,
      windowsHide: true,
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error(error.message, { cause: error }), {
          code: error.code,
          stdout,
          stderr,
        }))
        return
      }
      resolve({ stdout, stderr })
    })
  })

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
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
    const path = stageDir(root, 'origin')
    git(path, ['init'])
    git(path, ['remote', 'add', 'origin', 'https://github.com/o/r.git'])
    const created = await controller.create({ path })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({ remoteUrl: 'https://github.com/o/r.git' })
  })

  it('returns no remoteUrl for a checkout without origin and a non-Git Workspace', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
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

  it('treats a blank origin URL as unbound', async () => {
    const command = vi.fn<NativeCommandRunner>().mockResolvedValue({ stdout: '  \n', stderr: '' })
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'blank') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
  })

  it('maps a non-zero Git exit without origin to an unbound Workspace', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(new Error('workspace Git exited with code 2'))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'nonzero') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
  })

  it('does not treat a missing Git executable as an unbound Workspace', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'enoent') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('does not treat a Git usage or unexpected exit as a missing origin', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(Object.assign(new Error('workspace Git exited with code 129'), { code: 129 }))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'usage') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('does not treat a runner exception as a missing origin', async () => {
    const command = vi.fn<NativeCommandRunner>()
      .mockRejectedValue(new TypeError('controlled runner failure'))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'throw') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('does not treat a non-Error runner rejection as a missing origin', async () => {
    const command = vi.fn<NativeCommandRunner>().mockRejectedValue('boom')
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const created = await controller.create({ path: stageDir(root, 'string-throw') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps a corrupt Git config to workspace/git-failed instead of an unbound Workspace', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
    const path = stageDir(root, 'bad-config')
    git(path, ['init'])
    writeFileSync(join(path, '.git', 'config'), '[core\n')
    const created = await controller.create({ path })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps a nested checkout whose parent .git/config is corrupt to workspace/git-failed', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
    const repo = stageDir(root, 'nested-repo')
    git(repo, ['init'])
    git(repo, ['remote', 'add', 'origin', 'https://github.com/o/r.git'])
    const nested = stageDir(repo, 'nested/deep')
    writeFileSync(join(repo, '.git', 'config'), 'this is not valid git config [[[\n')
    const created = await controller.create({ path: nested })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps a bare repository whose ./config is corrupt to workspace/git-failed', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
    const bare = join(root, 'bare.git')
    git(root, ['init', '--bare', bare])
    git(bare, ['remote', 'add', 'origin', 'https://github.com/o/r.git'])
    writeFileSync(join(bare, 'config'), 'this is not valid git config [[[\n')
    const created = await controller.create({ path: bare })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps an unreadable .git directory to workspace/git-failed', async () => {
    const { controller, root } = await harness({ workspaceGitCommand: runGitC })
    const path = stageDir(root, 'denied')
    git(path, ['init'])
    const created = await controller.create({ path })
    chmodSync(join(path, '.git'), 0o000)
    try {
      await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
        .rejects.toMatchObject({ code: 'workspace/git-failed' })
    } finally {
      chmodSync(join(path, '.git'), 0o755)
    }
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
    expect(spawns[0]?.env?.LC_ALL).toBe('C')
    expect(spawns[0]?.env?.LANG).toBe('C')
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

  it('forces child LANG and LC_ALL to C even when the parent locale is not C', async () => {
    const previousLang = process.env.LANG
    const previousLcAll = process.env.LC_ALL
    process.env.LANG = 'zh_CN.UTF-8'
    process.env.LC_ALL = 'zh_CN.UTF-8'
    try {
      const spawns: SubprocessSpawnSpec[] = []
      const ctx = new Context()
      ctx.provide('subprocess', {
        spawn(spec: SubprocessSpawnSpec) {
          spawns.push(spec)
          return handle({
            outcome: { exitCode: 0, signal: null },
            collected: collected('https://github.com/o/r.git\n'),
          })
        },
      } as never)
      const run = createWorkspaceGitCommand(ctx, process.cwd())
      await expect(run('git', ['remote', 'get-url', 'origin'], new AbortController().signal))
        .resolves.toEqual({ stdout: 'https://github.com/o/r.git\n', stderr: '' })
      expect(spawns[0]?.env?.LANG).toBe('C')
      expect(spawns[0]?.env?.LC_ALL).toBe('C')
    } finally {
      if (previousLang === undefined) delete process.env.LANG
      else process.env.LANG = previousLang
      if (previousLcAll === undefined) delete process.env.LC_ALL
      else process.env.LC_ALL = previousLcAll
    }
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

  it('preserves a non-zero Git exit code on the thrown result', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return handle({
          outcome: { exitCode: 2, signal: null },
          collected: collected(''),
        })
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    const failure = await run('git', ['remote', 'get-url', 'origin'], new AbortController().signal)
      .then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 2 })
  })

  it('preserves a terminating signal on the thrown result', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return handle({
          outcome: { exitCode: null, signal: 'SIGTERM' },
          collected: collected(''),
        })
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    const failure = await run('git', ['remote', 'get-url', 'origin'], new AbortController().signal)
      .then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 'SIGTERM', signal: 'SIGTERM' })
  })

  it('preserves an unknown terminating outcome on the thrown result', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return handle({
          outcome: { exitCode: null, signal: null },
          collected: collected(''),
        })
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    const failure = await run('git', ['remote', 'get-url', 'origin'], new AbortController().signal)
      .then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 'unknown signal', signal: null })
  })

  it('terminates the process tree when the caller aborts before settlement', async () => {
    const abort = new AbortController()
    let terminateCalls = 0
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return {
          pid: 1,
          stdin: undefined,
          stdout: undefined,
          stderr: undefined,
          collected: collected(''),
          done: new Promise<SubprocessOutcome>((resolve) => {
            queueMicrotask(() => {
              abort.abort()
              resolve({ exitCode: null, signal: 'SIGTERM' })
            })
          }),
          terminate() { terminateCalls += 1 },
          waitForExit() { return Promise.resolve(true) },
        }
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    await expect(run('git', ['remote', 'get-url', 'origin'], abort.signal)).rejects.toMatchObject({
      code: 'SIGTERM',
    })
    expect(terminateCalls).toBe(1)
  })

  it('propagates a spawn ENOENT from the subprocess service', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {
      spawn() {
        return {
          pid: 1,
          stdin: undefined,
          stdout: undefined,
          stderr: undefined,
          collected: collected(''),
          done: Promise.reject(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })),
          terminate() {},
          waitForExit() { return Promise.resolve(true) },
        }
      },
    } as never)
    const run = createWorkspaceGitCommand(ctx, process.cwd())
    const failure = await run('git', ['remote', 'get-url', 'origin'], new AbortController().signal)
      .then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 'ENOENT' })
  })

  it('reads a numeric Git exit from a production runner message without an attached code', () => {
    expect(workspaceGitFailureCode(new Error('workspace Git exited with code 2'))).toBe(2)
    expect(workspaceGitFailureCode(new Error('workspace Git exited with SIGTERM'))).toBeUndefined()
    expect(workspaceGitFailureCode({})).toBeUndefined()
    expect(workspaceGitFailureCode(5)).toBeUndefined()
  })
})

describe('WorkspaceController.gitRemote production runner classification', () => {
  it('maps a subprocess signal death to workspace/git-failed', async () => {
    const { controller, root } = await harness({
      subprocess: {
        spawn() {
          return handle({
            outcome: { exitCode: null, signal: 'SIGTERM' },
            collected: collected(''),
          })
        },
      },
    })
    const created = await controller.create({ path: stageDir(root, 'signal') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps a subprocess spawn ENOENT to workspace/git-failed', async () => {
    const { controller, root } = await harness({
      subprocess: {
        spawn() {
          return {
            pid: 1,
            stdin: undefined,
            stdout: undefined,
            stderr: undefined,
            collected: collected(''),
            done: Promise.reject(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })),
            terminate() {},
            waitForExit() { return Promise.resolve(true) },
          }
        },
      },
    })
    const created = await controller.create({ path: stageDir(root, 'spawn-missing') })
    await expect(controller.gitRemote({ workspaceId: created.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })

  it('maps production get-url exit 2 to unbound and exit 129 to git-failed', async () => {
    const exits = [2, 129]
    const { controller, root } = await harness({
      subprocess: {
        spawn() {
          const exitCode = exits.shift() ?? 129
          return handle({
            outcome: { exitCode, signal: null },
            collected: collected(''),
          })
        },
      },
    })
    const first = await controller.create({ path: stageDir(root, 'prod-2') })
    const second = await controller.create({ path: stageDir(root, 'prod-129') })
    await expect(controller.gitRemote({ workspaceId: first.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({})
    await expect(controller.gitRemote({ workspaceId: second.workspace.workspaceId }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'workspace/git-failed' })
  })
})
