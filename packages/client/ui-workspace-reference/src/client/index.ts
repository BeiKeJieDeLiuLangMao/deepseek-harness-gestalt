/**
 * Workspace Reference browser half: registers the `@` `workspace` source.
 * Candidates come from the host index Remote, ranked locally. A pick inserts
 * plain-text `@rel/path`; the host pre-step injects the existence marker.
 *
 * Portions of picker ranking are derived from omdsh-dev/dsh-at-file 0.6.3 (MIT).
 * Copyright (c) 2026 dsh-at-file contributors. See NOTICE.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { WORKSPACE_REFERENCE_INVOCATIONS } from './invocations.ts'
import { createWorkspaceSource } from './source.ts'
import type { WorkspacePathEntry } from './rank.ts'

export const inject = ['inputTriggers', 'remote', 'typert']

/** Browser plugin configuration, validated at load. */
export interface Config {
  /** Maximum ranked picker rows shown after `@`. */
  menuLimit: number
}

export const Config = z.object({
  menuLimit: z.natural().min(1).default(12),
})

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
 * @param config - optional plugin config; omitted fields use schema defaults.
 */
export async function apply(ctx: ClientContext, config?: Config): Promise<void> {
  const resolved = Config(config ?? {})
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
  }, resolved.menuLimit)
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      void disposeMount()
    }
  }, 'ui-workspace-reference: @ source')
}
