/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tools-eligibility`.
 * @module @deepseek-ai/dsh-tools-eligibility/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { ToolEligibilityPublication } from './index.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-tools-eligibility'

/** Cordis companion plugin name. */
export const name = 'tool-eligibility-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Compare one optional normalized name list. */
function sameNames(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return left === right || (left !== undefined && right !== undefined
    && left.length === right.length && left.every((entry, index) => entry === right[index]))
}

/** Validate a settings publication against the authoritative live registry view. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('tool-eligibility/published', (agent, publication: ToolEligibilityPublication) => {
    const actual = ctx.tools.eligibilityAllow(agent)
    if (!sameNames(actual, publication.effectiveAllow)) {
      fail(`published effective allowance ${JSON.stringify(publication.effectiveAllow)} differs from live registry allowance ${JSON.stringify(actual)} for Session ${JSON.stringify(String(agent.session.id))}`)
    }
    for (const name of publication.settingsAllow ?? []) {
      if (!actual?.includes(name)) {
        fail(`settings allowance ${JSON.stringify(name)} is absent from the live registry for Session ${JSON.stringify(String(agent.session.id))}`)
      }
    }
  }, { global: true })
}, { inject: ['tools'] })

/**
 * Register this package's invariant companion.
 * @param ctx - context carrying the invariant service.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
