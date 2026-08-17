/**
 * Agent-plane positive tool-eligibility declaration carried by an agent
 * preset. Workspace and Session additions are resolved by the host-plane
 * eligibility service after the preset has mounted.
 * @module @deepseek-ai/dsh-agent-tool-eligibility
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: brings the `ctx.tools` declaration into this compiler face.
import type {} from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'agent-tool-eligibility'

/** Services required by the declaration row. */
export const inject = ['tools']

/** Positive allow-only preset configuration. */
export interface Config {
  /** Exact public tool names this preset makes eligible. Empty allows none. */
  allow: string[]
}

/** Runtime schema exposed to preset authors and the generated config catalog. */
export const Config: z<Config> = z.object({
  allow: z.array(z.string().min(1)).required(),
})

/**
 * Add this preset's allowance to its standing scope.
 * @param ctx - the preset's mounting scope.
 * @param config - positive eligibility entries.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.allowEligible(config.allow)
}
