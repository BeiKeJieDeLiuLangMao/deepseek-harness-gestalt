/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-workspace-reference`.
 * @module @deepseek-ai/dsh-client-ui-workspace-reference/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-workspace-reference'

/** Cordis companion plugin name. */
export const name = 'client-ui-workspace-reference-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the node half registers the `workspace-reference`
 * settings namespace, and the browser snapshot mirrors that durable document.
 * Slot conflicts fail loud in the slot core. Picker, dock, and paste rewrite
 * are presentational over typed RPC and the snapshot, covered by component
 * tests rather than a Cordis runtime relationship.
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
