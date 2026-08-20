/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-workspace-reference`.
 * @module @deepseek-ai/dsh-workspace-reference/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workspace-reference'

/** Cordis companion plugin name. */
export const name = 'workspace-reference-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: each pre-step injection is an immutable per-call
 * snapshot validated while it is built, and the agent/session layers own
 * durable context admission, freezing, and replay.
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
