/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tools-eligibility`.
 * @module @deepseek-ai/dsh-tools-eligibility/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tools-eligibility'

/** Cordis companion plugin name. */
export const name = 'tool-eligibility-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the tools registry owns the schema/execution equivalence this package configures. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - context carrying the invariant service.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
