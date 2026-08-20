/**
 * Host runtime for picker search. Indexes the session cwd through `ctx.fs`
 * and returns the raw entry list; the browser ranks per keystroke.
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { DEFAULT_IGNORE_FILES } from './defaults.ts'
import { indexWorkspace } from './files.ts'
import type { Config } from './index.ts'
import type { WorkspacePathEntry } from './types.ts'

/** Cordis service key and default Typert namespace. */
export const SERVICE_KEY = 'workspaceReference'

/** Host search service consumed by the Web picker Remote. */
export class WorkspaceReferenceRuntime extends TypertRemoteService {
  static inject = ['fs']

  /**
   * @param ctx - host context with `ctx.fs`.
   * @param config - resolved plugin config.
   */
  constructor(
    ctx: Context,
    private readonly config: Config,
  ) {
    super(ctx, SERVICE_KEY)
  }

  /**
   * Index the addressed agent's workspace.
   * @param agent - session-backed agent whose header owns cwd.
   * @param signal - caller lifetime.
   * @returns indexed files and directories, possibly truncated.
   */
  async search(agent: Agent, signal: AbortSignal): Promise<readonly WorkspacePathEntry[]> {
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return []
    const index = await indexWorkspace(this.ctx.fs, cwd, {
      maxFiles: this.config.maxIndexedFiles,
      ignoreDirs: this.config.ignoreDirs,
      ignoreFiles: DEFAULT_IGNORE_FILES,
    }, signal)
    return index.files
  }
}
