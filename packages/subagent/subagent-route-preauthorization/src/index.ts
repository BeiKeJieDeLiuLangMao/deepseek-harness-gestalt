/** Deployment-owned exact child LLM route authorization service. */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

/** One exact provider/model route authorized for child delegation. */
export interface SubagentRoute {
  readonly provider: string
  readonly model: string
}

/**
 * Build the stable identity for one exact child LLM route.
 * @param route - provider and model pair to identify.
 * @returns the NUL-delimited provider/model key.
 */
export function modelRouteKey(route: SubagentRoute): string {
  return `${route.provider}\0${route.model}`
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Immutable deployment-owned exact child LLM route authorization. */
    subagentRoutePreauthorization: SubagentRoutePreauthorization
  }
}

/** Service Definition for deployment-owned exact child LLM routes. */
export abstract class SubagentRoutePreauthorization extends Service {
  constructor(ctx: Context) {
    super(ctx, 'subagentRoutePreauthorization')
  }

  /**
   * Return detached immutable routes authorized for a new top-level Session.
   * @returns the deployment's exact provider/model routes.
   */
  abstract snapshot(): readonly SubagentRoute[]
}

export default SubagentRoutePreauthorization
