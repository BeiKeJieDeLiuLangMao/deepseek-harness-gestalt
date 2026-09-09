import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import WorkspaceController from '../src/index.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(options: {
  readonly workspaceGitCommand?: NativeCommandRunner
  readonly subprocess?: { spawn(spec: SubprocessSpawnSpec): SubprocessHandle }
  readonly productionSubprocess?: boolean
} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-clone-git-')))
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
  if (options.productionSubprocess === true) await ctx.plugin(LocalSubprocessRuntime)
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

function collected(text = '', stderrText = ''): SubprocessHandle['collected'] {
  return {
    stdout: { readFrom: () => ({ text, nextOffset: text.length, lossy: false }) },
    stderr: { readFrom: () => ({ text: stderrText, nextOffset: stderrText.length, lossy: false }) },
  }
}

function handle(outcome: SubprocessOutcome = { exitCode: 0, signal: null }): SubprocessHandle {
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    collected: collected(),
    done: Promise.resolve(outcome),
    terminate() {},
    waitForExit() { return Promise.resolve(true) },
  }
}

describe('WorkspaceController.cloneGit', () => {
  it('clones a local bare remote through argv Git and registers the Workspace', async () => {
    const { controller, root } = await harness({ productionSubprocess: true })
    const remote = join(root, 'remote.git')
    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
    const cloned = await controller.cloneGit({
      remoteUrl: remote,
      parentPath: root,
      directoryName: 'real-clone',
    }, new AbortController().signal)
    expect(cloned.workspace.path).toBe(join(root, 'real-clone'))
    expect(cloned.workspace.title).toBe('real-clone')
    await expect(controller.gitRemote({ workspaceId: cloned.workspace.workspaceId }, new AbortController().signal))
      .resolves.toEqual({ remoteUrl: remote })
  })

  it('rejects a directoryName that is not one path segment before Git runs', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller, root } = await harness({ workspaceGitCommand: command })
    for (const directoryName of ['nested/dir', '..', '.', 'win\\seg', '  ']) {
      await expect(controller.cloneGit({
        remoteUrl: 'https://github.com/o/r.git',
        parentPath: root,
        directoryName,
      }, new AbortController().signal)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    }
    expect(command).not.toHaveBeenCalled()
  })

  it('passes clone argv with a literal -- separator and does not spawn a shell', async () => {
    const command = vi.fn<NativeCommandRunner>(async () => ({ stdout: '', stderr: '' }))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const response = await controller.cloneGit({
      remoteUrl: 'https://github.com/o/r.git',
      parentPath: root,
      directoryName: 'cloned',
    }, new AbortController().signal)
    expect(response.workspace).toMatchObject({ path: join(root, 'cloned'), title: 'cloned' })
    expect(command.mock.calls[0]?.slice(0, 2)).toEqual([
      'git', ['clone', '--', 'https://github.com/o/r.git', join(root, 'cloned')],
    ])
  })

  it('accepts scp-like ssh remotes and local file paths', async () => {
    const command = vi.fn<NativeCommandRunner>(async () => ({ stdout: '', stderr: '' }))
    const { controller, root } = await harness({ workspaceGitCommand: command })
    await controller.cloneGit({
      remoteUrl: 'git@github.com:o/r.git',
      parentPath: root,
      directoryName: 'ssh-clone',
    }, new AbortController().signal)
    await controller.cloneGit({
      remoteUrl: join(root, 'remote.git'),
      parentPath: root,
      directoryName: 'file-clone',
    }, new AbortController().signal)
    expect(command.mock.calls[0]?.[1]).toEqual(['clone', '--', 'git@github.com:o/r.git', join(root, 'ssh-clone')])
    expect(command.mock.calls[1]?.[1]).toEqual(['clone', '--', join(root, 'remote.git'), join(root, 'file-clone')])
  })

  it('refuses an occupied directory, file, or symlink without deleting the occupant', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller, root } = await harness({ workspaceGitCommand: command })
    const occupiedDir = join(root, 'taken-dir')
    mkdirSync(occupiedDir)
    writeFileSync(join(occupiedDir, 'keep'), 'keep')
    const occupiedFile = join(root, 'taken-file')
    writeFileSync(occupiedFile, 'keep-file')
    const occupiedLink = join(root, 'taken-link')
    symlinkSync(occupiedDir, occupiedLink)
    for (const directoryName of ['taken-dir', 'taken-file', 'taken-link']) {
      await expect(controller.cloneGit({
        remoteUrl: 'https://github.com/o/r.git',
        parentPath: root,
        directoryName,
      }, new AbortController().signal)).rejects.toMatchObject({
        code: 'workspace/clone-failed',
        details: { path: join(root, directoryName) },
      })
    }
    expect(command).not.toHaveBeenCalled()
    expect(existsSync(join(occupiedDir, 'keep'))).toBe(true)
    expect(existsSync(occupiedFile)).toBe(true)
    expect(existsSync(occupiedLink)).toBe(true)
  })

  it('keeps a partial target when Git fails and names the path in the error', async () => {
    const { controller, root } = await harness({
      workspaceGitCommand: async (_command, args) => {
        const target = args[args.length - 1] ?? ''
        writeFileSync(join(target, 'partial'), 'left')
        throw new Error('clone refused')
      },
    })
    await expect(controller.cloneGit({
      remoteUrl: 'https://github.com/o/r.git',
      parentPath: root,
      directoryName: 'failed',
    }, new AbortController().signal)).rejects.toMatchObject({
      code: 'workspace/clone-failed',
      details: { path: join(root, 'failed'), parentPath: root, directoryName: 'failed' },
    })
    expect(existsSync(join(root, 'failed', 'partial'))).toBe(true)
  })

  it('maps caller abort to gateway/cancelled, reaps Git, and keeps the partial directory', async () => {
    const abort = new AbortController()
    const command = vi.fn<NativeCommandRunner>(async (_command, args, signal) => {
      writeFileSync(join(args[args.length - 1] ?? '', 'partial'), 'left')
      abort.abort()
      if (signal.aborted) throw new Error('aborted')
      throw new Error('aborted')
    })
    const { controller, root } = await harness({ workspaceGitCommand: command })
    await expect(controller.cloneGit({
      remoteUrl: 'https://github.com/o/r.git',
      parentPath: root,
      directoryName: 'aborted',
    }, abort.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
    expect(existsSync(join(root, 'aborted', 'partial'))).toBe(true)
  })

  it('rejects git and helper protocols before spawn so a custom helper never runs', async () => {
    const command = vi.fn<NativeCommandRunner>()
    const { controller, root } = await harness({ workspaceGitCommand: command })
    for (const remoteUrl of ['git://example.com/r.git', 'ext::git-remote-evil r', 'http://example.com/r.git']) {
      await expect(controller.cloneGit({
        remoteUrl,
        parentPath: root,
        directoryName: 'evil',
      }, new AbortController().signal)).rejects.toMatchObject({ code: 'workspace/clone-failed' })
    }
    expect(command).not.toHaveBeenCalled()
    expect(existsSync(join(root, 'evil'))).toBe(false)
  })

  it('keeps the cloned directory when Workspace registration fails', async () => {
    const { controller, ctx, root } = await harness({
      workspaceGitCommand: async (_command, args) => {
        writeFileSync(join(args[args.length - 1] ?? '', 'cloned'), 'ok')
        return { stdout: '', stderr: '' }
      },
    })
    vi.spyOn(ctx.workspaceRegistry, 'create').mockRejectedValue(new Error('registry refused'))
    const target = join(root, 'reg-fail')
    await expect(controller.cloneGit({
      remoteUrl: 'https://github.com/o/r.git',
      parentPath: root,
      directoryName: 'reg-fail',
    }, new AbortController().signal)).rejects.toMatchObject({
      code: 'workspace/clone-failed',
      details: { path: target },
    })
    expect(existsSync(join(target, 'cloned'))).toBe(true)
  })

  it('forces GIT_ALLOW_PROTOCOL and an empty global config outside the clone dest', async () => {
    const spawns: SubprocessSpawnSpec[] = []
    const { controller, root } = await harness({
      subprocess: {
        spawn(spec) {
          spawns.push(spec)
          return handle()
        },
      },
    })
    await controller.cloneGit({
      remoteUrl: 'https://github.com/o/r.git',
      parentPath: root,
      directoryName: 'proto',
    }, new AbortController().signal)
    expect(spawns[0]?.argv).toEqual(['git', 'clone', '--', 'https://github.com/o/r.git', join(root, 'proto')])
    expect(spawns[0]?.env?.GIT_ALLOW_PROTOCOL).toBe('https:file:ssh')
    expect(spawns[0]?.env?.GIT_CONFIG_NOSYSTEM).toBe('1')
    const globalConfig = spawns[0]?.env?.GIT_CONFIG_GLOBAL
    expect(typeof globalConfig).toBe('string')
    expect(globalConfig?.startsWith(join(root, 'proto'))).toBe(false)
  })
})
