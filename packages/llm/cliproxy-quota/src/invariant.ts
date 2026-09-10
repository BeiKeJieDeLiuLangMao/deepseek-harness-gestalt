/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-cliproxy-quota`.
 * @module @deepseek-ai/dsh-cliproxy-quota/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-cliproxy-quota'

/** Cordis companion plugin name. */
export const name = 'cliproxy-quota-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this pure observation library owns no event stream or
 * mutable runtime data; probe construction, parsing, and sanitization are
 * enforced by unit and assembly tests over a fake transport.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
