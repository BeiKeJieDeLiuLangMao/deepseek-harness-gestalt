/** Host Workspace Remote owner: explicit commands and reconnect-safe state. */

import { Context } from '@deepseek-ai/cordis'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { WorkspaceCommands } from './commands.ts'
import { DirectoryPickerController } from './directory-picker.ts'
import { WorkspaceFeed } from './feed.ts'
import { createWorkspaceGitCommand, DEFAULT_WORKSPACE_GIT_TIMEOUT_MS } from './git.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCloneGitRequest,
  WorkspaceCloneGitValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceFollowFrame,
  WorkspaceGitRemoteRequest,
  WorkspaceGitRemoteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspaceRenameRequest,
  WorkspaceValue,
} from './types.ts'

/** Host-owned Workspace Git deadline and optional test runner. */
export interface Config {
  /** Host deadline in milliseconds for one Workspace Git command. */
  readonly gitTimeoutMs?: number
}

/** Optional Host Git runner for Workspace origin inspection. */
export interface WorkspaceControllerOptions extends Config {
  /** No-shell Git runner; defaults to the subprocess-tree production runner. */
  readonly workspaceGitCommand?: NativeCommandRunner
}

export type * from './types.ts'
export { DirectoryPickerController } from './directory-picker.ts'
export {
  createWorkspaceGitCommand,
  DEFAULT_WORKSPACE_GIT_TIMEOUT_MS,
  workspaceCloneRemoteKind,
} from './git.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Workspace business API and Remote namespace owner. */
    workspaceController: WorkspaceController
  }
}

/** Host service backing the generated `ctx.remote.workspace` namespace. */
export class WorkspaceController extends TypertRemoteService {
  static inject = ['typert', 'workspaceRegistry']

  static Config: z.ZodType<Config> = z.object({
    gitTimeoutMs: z.number().gt(0).max(MAX_TIMER_DELAY_MS).default(DEFAULT_WORKSPACE_GIT_TIMEOUT_MS),
  }).prefault({})

  private readonly commands: WorkspaceCommands
  private readonly feed: WorkspaceFeed

  /**
   * @param ctx - Host context containing the Workspace registry.
   * @param options - Host Git deadline and optional test runner; production uses `ctx.subprocess`.
   */
  constructor(ctx: Context, options: WorkspaceControllerOptions = {}) {
    super(ctx, 'workspaceController', { namespace: 'workspace' })
    const gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_WORKSPACE_GIT_TIMEOUT_MS
    this.commands = new WorkspaceCommands(
      ctx,
      options.workspaceGitCommand ?? createWorkspaceGitCommand(ctx, process.cwd(), gitTimeoutMs),
    )
    this.feed = new WorkspaceFeed(ctx)
    // This package is the Loader entry for both Remote owners it hosts: the
    // directory-picking seam is abstract and never an entry itself. The child
    // stays pending until a picking backend is composed, so a host without one
    // registers no picking namespace instead of answering an unservable verb.
    ctx.plugin(DirectoryPickerController)
  }

  /**
   * Create or idempotently resolve one Workspace over an existing directory.
   * @param request - directory path to register.
   * @returns the Workspace and whether this call created it.
   */
  @Remote('create')
  create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue> {
    return this.commands.create(request)
  }

  /**
   * Rename one Workspace to a unique non-blank title.
   * @param request - Workspace identity and proposed title.
   * @returns the updated Workspace projection.
   */
  @Remote('rename')
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue> {
    return this.commands.rename(request)
  }

  /**
   * Remove one Workspace registration while retaining files and Sessions.
   * @param request - Workspace identity to remove.
   * @returns deletion confirmation.
   */
  @Remote('delete')
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue> {
    return this.commands.delete(request)
  }

  /**
   * Move one Workspace within the registry display order.
   * @param request - moved Workspace and optional anchor.
   * @returns the complete resulting Workspace order.
   */
  @Remote('insertBefore')
  insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue> {
    return this.commands.insertBefore(request)
  }

  /**
   * Move one accounted Session within a Workspace.
   * @param request - Workspace, Session, and optional anchor identities.
   * @returns the updated Workspace projection.
   */
  @Remote('insertSessionBefore')
  insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue> {
    return this.commands.insertSessionBefore(request)
  }

  /**
   * Hide one known Session from Workspace grouping surfaces.
   * @param request - Session identity to archive.
   * @returns the complete resulting archive set.
   */
  @Remote('archiveSession')
  archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    return this.commands.archiveSession(request)
  }

  /**
   * Read the configured Git `origin` of one registered Workspace.
   * @param request - Workspace identity.
   * @param signal - caller lifetime; abort terminates the Git process tree.
   * @returns `{ remoteUrl }` when origin is non-empty; `{}` when the checkout is not Git or has no origin.
   *   Host deadline, missing Git, permission, corrupt config, signal death, and other execution
   *   failures reject with `workspace/git-failed`.
   */
  @Remote('gitRemote')
  gitRemote(request: WorkspaceGitRemoteRequest, signal: AbortSignal): Promise<WorkspaceGitRemoteValue> {
    return this.commands.gitRemote(request, signal)
  }

  /**
   * Clone a Git remote into a new child directory and register it as a Workspace.
   * Exclusive `mkdir` refuses an existing file, directory, or link. Git or registry
   * failure keeps the partial directory and reports its path. The Host never
   * recursively deletes that published target.
   * @param request - remote URL, existing parent, and one path segment.
   * @param signal - caller lifetime; abort terminates Git and keeps a partial target.
   * @returns the registered Workspace.
   */
  @Remote('cloneGit')
  cloneGit(request: WorkspaceCloneGitRequest, signal: AbortSignal): Promise<WorkspaceCloneGitValue> {
    return this.commands.cloneGit(request, signal)
  }

  /**
   * Stream a complete Workspace baseline followed by ordered increments.
   * @param signal - generation cancellation.
   * @returns baseline followed by ordered Workspace increments.
   */
  @Remote({ mode: 'stream' })
  follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    return this.feed.follow(signal)
  }
}

export default WorkspaceController
