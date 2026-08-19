/**
 * Workspace Reference browser half: registers the `@` `workspace` source.
 * Candidates come from the host index Remote, ranked locally. A pick inserts
 * plain-text `@rel/path`; the host pre-step injects the existence marker.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { WORKSPACE_REFERENCE_INVOCATIONS } from './invocations.ts'
import { createWorkspaceSource } from './source.ts'
import type { WorkspacePathEntry } from './rank.ts'

export const inject = ['inputTriggers', 'remote', 'typert']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    workspaceReference: {
      search(agentId: string, signal?: AbortSignal): Promise<RemoteResult<readonly WorkspacePathEntry[]>>
    }
  }
}

/**
 * Register the workspace `@` source and mount the host search Remote.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeMount = await ctx.remote.$mount({
    package: '@deepseek-ai/dsh-workspace-reference',
    descriptors: WORKSPACE_REFERENCE_INVOCATIONS,
  })
  const workspaceReference = ctx.get('remote.workspaceReference') as {
    search(agentId: string, signal?: AbortSignal): Promise<RemoteResult<readonly WorkspacePathEntry[]>>
  }
  const source = createWorkspaceSource(async (sessionId: SessionId, signal) => {
    const result = await workspaceReference.search(sessionId, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      void disposeMount()
    }
  }, 'ui-workspace-reference: @ source')
}
