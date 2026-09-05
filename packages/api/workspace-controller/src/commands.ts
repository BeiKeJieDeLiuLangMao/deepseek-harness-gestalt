/** Workspace command implementation and stable Remote failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  WorkspaceId,
  WorkspaceMoveInvalidError,
  WorkspaceOrderInvalidError,
  WorkspaceUnknownSessionError,
} from '@deepseek-ai/dsh-workspace'
import { lstat, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { workspaceView } from './feed.ts'
import { workspaceCloneRemoteKind, workspaceGitFailureCode } from './git.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCloneGitRequest,
  WorkspaceCloneGitValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceGitRemoteRequest,
  WorkspaceGitRemoteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspaceRenameRequest,
  WorkspaceValue,
} from './types.ts'

/** Implements Workspace mutations against the authoritative registry. */
export class WorkspaceCommands {
  private operationTail = Promise.resolve()

  /**
   * @param ctx - Host context containing the Workspace registry.
   * @param runGit - no-shell Git runner; production uses the subprocess tree service.
   */
  constructor(
    private readonly ctx: Context,
    private readonly runGit: NativeCommandRunner,
  ) {}

  /**
   * Create or resolve one Workspace over an existing directory.
   * @param request - directory path to register.
   * @returns the Workspace and whether this call created it.
   */
  create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue> {
    return this.enqueue(async () => {
      try {
        const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path)
        if (existing !== undefined) {
          return { workspace: workspaceView(existing), created: false }
        }
        const workspace = await this.ctx.workspaceRegistry.create(request.path)
        return { workspace: workspaceView(workspace), created: true }
      } catch (error) {
        if (remoteErrorOf(error) !== undefined) throw error
        throw new RemoteError(
          'workspace/invalid-path',
          `cannot create a Workspace at "${request.path}": ${errorMessage(error)}`,
          { path: request.path },
          { cause: error },
        )
      }
    })
  }

  /**
   * Rename one Workspace after serializing title ownership checks.
   * @param request - Workspace identity and proposed title.
   * @returns the updated Workspace projection.
   */
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue> {
    const title = request.title.trim()
    if (title === '') {
      return Promise.reject(new RemoteError('gateway/bad-request', 'Workspace rename requires a non-blank title', {}))
    }
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      if (title !== workspace.title) {
        if (this.ctx.workspaceRegistry.list().some(candidate =>
          candidate.id !== workspace.id && candidate.title === title)) {
          throw new RemoteError(
            'workspace/name-conflict',
            `Workspace name '${title}' is already in use`,
            { name: title },
          )
        }
        await workspace.setTitle(title)
      }
      return { workspace: workspaceView(workspace) }
    })
  }

  /**
   * Delete one Workspace registration without deleting its directory or Sessions.
   * @param request - Workspace identity to remove.
   * @returns deletion confirmation.
   */
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue> {
    return this.enqueue(async () => {
      if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) {
        throw workspaceNotFound(request.workspaceId)
      }
      return { deleted: true }
    })
  }

  /**
   * Move one Workspace within the durable registry order.
   * @param request - moved Workspace and optional anchor.
   * @returns the complete resulting Workspace order.
   */
  async insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue> {
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(
        WorkspaceId(request.workspaceId),
        request.beforeWorkspaceId === undefined
          ? undefined
          : WorkspaceId(request.beforeWorkspaceId),
      )
      return { workspaceIds: [...workspaceIds] }
    } catch (error) {
      if (!(error instanceof WorkspaceOrderInvalidError)) throw error
      throw workspaceNotFound(error.workspaceId)
    }
  }

  /**
   * Move one accounted Session within a Workspace's manual order.
   * @param request - Workspace, Session, and optional anchor identities.
   * @returns the updated Workspace projection.
   */
  async insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    try {
      await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceMoveInvalidError)) throw error
      throw new RemoteError(
        'workspace/move-invalid',
        error.message,
        {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ...request.beforeSessionId === undefined
            ? {}
            : { beforeSessionId: request.beforeSessionId },
        },
        { cause: error },
      )
    }
    return { workspace: workspaceView(workspace) }
  }

  /**
   * Read the configured `origin` of one registered Workspace checkout.
   * @param request - Workspace identity.
   * @param signal - caller lifetime; abort terminates the Git process tree.
   * @returns `{ remoteUrl }` when origin is non-empty; `{}` for a non-Git directory or a checkout without `origin`.
   *   Host deadline and other Git execution failures reject with `workspace/git-failed`.
   */
  async gitRemote(request: WorkspaceGitRemoteRequest, signal: AbortSignal): Promise<WorkspaceGitRemoteValue> {
    if (signal.aborted) {
      throw new RemoteError('gateway/cancelled', 'workspace remote inspection was aborted', {})
    }
    const workspace = this.requireWorkspace(request.workspaceId)
    try {
      const { stdout } = await this.runGit(
        'git',
        ['-C', workspace.path, 'remote', 'get-url', 'origin'],
        signal,
      )
      const remoteUrl = stdout.trim()
      return remoteUrl === '' ? {} : { remoteUrl }
    } catch (error) {
      if (signal.aborted) {
        throw new RemoteError('gateway/cancelled', 'workspace remote inspection was aborted', {}, { cause: error })
      }
      if (isUnboundOriginFailure(error)) return {}
      throw gitFailed(request.workspaceId, error)
    }
  }

  /**
   * Clone one Git remote into a new child directory and register it as a Workspace.
   * Exclusive `mkdir` of the published name; Git or registry failure keeps that directory.
   * @param request - remote URL, existing parent directory, and one path segment.
   * @param signal - caller lifetime; abort terminates Git and keeps a partial target.
   * @returns the registered Workspace.
   */
  cloneGit(request: WorkspaceCloneGitRequest, signal: AbortSignal): Promise<WorkspaceCloneGitValue> {
    if (signal.aborted) {
      return Promise.reject(new RemoteError('gateway/cancelled', 'workspace clone was aborted', {}))
    }
    const remoteUrl = request.remoteUrl.trim()
    const parentPath = request.parentPath.trim()
    const directoryName = request.directoryName.trim()
    if (remoteUrl === '' || parentPath === '') {
      return Promise.reject(new RemoteError(
        'gateway/bad-request',
        'workspace clone requires a remote URL and parent path',
        {},
      ))
    }
    if (!isOnePathSegment(directoryName)) {
      return Promise.reject(new RemoteError(
        'gateway/bad-request',
        'workspace clone requires directoryName to be one path segment',
        {},
      ))
    }
    if (workspaceCloneRemoteKind(remoteUrl) === undefined) {
      return Promise.reject(new RemoteError(
        'workspace/clone-failed',
        'workspace clone allows only https, ssh, or file remotes',
        { path: join(parentPath, directoryName), parentPath, directoryName },
      ))
    }
    const target = join(parentPath, directoryName)
    return this.enqueue(async () => {
      try {
        const parent = await lstat(parentPath)
        if (parent.isSymbolicLink() || parent.isFile()) {
          throw new Error('parent path is not a directory')
        }
        const parentStat = await stat(parentPath)
        if (!parentStat.isDirectory()) throw new Error('parent path is not a directory')
        await mkdir(target)
        const created = await lstat(target)
        if (created.isSymbolicLink()) {
          throw new Error('clone target was replaced by a symbolic link')
        }
        if (signal.aborted) throw new Error('aborted')
        await this.runGit('git', ['clone', '--', remoteUrl, target], signal)
        const workspace = await this.ctx.workspaceRegistry.create(target)
        return { workspace: workspaceView(workspace) }
      } catch (error) {
        if (signal.aborted) {
          throw new RemoteError('gateway/cancelled', 'workspace clone was aborted', {}, { cause: error })
        }
        throw new RemoteError(
          'workspace/clone-failed',
          `cannot clone Workspace into "${target}": ${errorMessage(error)}`,
          { path: target, parentPath, directoryName },
          { cause: error },
        )
      }
    })
  }

  /**
   * Add one known Session to the registry-global archive set.
   * @param request - Session identity to archive.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    try {
      await this.ctx.workspaceRegistry.archiveSession(request.sessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceUnknownSessionError)) throw error
      throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
    }
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) throw workspaceNotFound(workspaceId)
    return workspace
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function workspaceNotFound(workspaceId: WorkspaceId): RemoteError<'workspace/not-found'> {
  return new RemoteError(
    'workspace/not-found',
    `Workspace "${workspaceId}" not found`,
    { workspaceId },
  )
}

function gitFailed(workspaceId: WorkspaceId, error: unknown): RemoteError<'workspace/git-failed'> {
  return new RemoteError(
    'workspace/git-failed',
    errorMessage(error),
    { workspaceId },
    { cause: error },
  )
}

/**
 * `git remote get-url origin` uses exit 2 for a missing `origin`. Exit 128 is
 * unbound only for the C-locale `not a git repository` diagnostic; nested and
 * bare checkouts can fail 128 without a Workspace-local `.git`.
 */
function isUnboundOriginFailure(error: unknown): boolean {
  const code = workspaceGitFailureCode(error)
  if (code === 2) return true
  if (code !== 128) return false
  return workspaceGitFailureText(error).includes('not a git repository')
}

function workspaceGitFailureText(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
  const message = error instanceof Error ? error.message : ''
  return `${stderr}\n${message}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isOnePathSegment(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\')
}
