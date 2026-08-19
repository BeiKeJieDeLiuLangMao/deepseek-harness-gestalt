/**
 * Workspace Reference host plugin: validates `@path` tokens at `agent/pre-step`
 * and injects existence-only sourced context. File bytes are never read.
 *
 * @module @deepseek-ai/dsh-workspace-reference
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { DEFAULT_IGNORE_DIRS } from './defaults.ts'
import { mentionPreStep } from './mention.ts'
import { WorkspaceReferenceRuntime } from './runtime.ts'
import { TYPERT_MANIFEST } from './typert.ts'

export const name = 'workspace-reference'

export const inject = ['agents', 'fs', 'typert']

export { DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_FILES } from './defaults.ts'
export {
  escapeAttribute,
  expandMentions,
  mentionPreStep,
  referenceForm,
  scanMentions,
} from './mention.ts'
export { rankFiles } from './search.ts'
export { indexWorkspace } from './files.ts'
export type { IndexOptions, WorkspaceIndex } from './files.ts'
export type { MentionFileSystem, WorkspacePathEntry, WorkspaceReferenceSource } from './types.ts'

/** Host plugin configuration, validated at load. */
export interface Config {
  /** Hard cap on indexed workspace entries for the picker walk. */
  maxIndexedFiles: number
  /** Directory basenames the picker walk skips. */
  ignoreDirs: string[]
}

export const Config = z.object({
  maxIndexedFiles: z.natural().min(1).default(5000),
  ignoreDirs: z.array(z.string()).default([...DEFAULT_IGNORE_DIRS]),
})

/**
 * Mount the pre-step Workspace Reference marker.
 * @param ctx - host Cordis context.
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved = Config(config ?? {})
  new WorkspaceReferenceRuntime(ctx, resolved)
  ctx.typert.register(TYPERT_MANIFEST)
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
    return mentionPreStep(agent.session.header.cwd, ctx.fs, messages, signal, next)
  })
}
