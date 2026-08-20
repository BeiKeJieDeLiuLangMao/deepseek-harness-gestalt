/** Package-owned invariant companion for the Browser Runtime Service Definition. @module @deepseek-ai/dsh-browser-runtime/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-browser-runtime'

/** Cordis companion plugin name. */
export const name = 'browser-runtime-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the Service Definition owns types while each stateful Provider owns its lifecycle relation. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Context owning the invariant registry.
 * @returns the exact registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
