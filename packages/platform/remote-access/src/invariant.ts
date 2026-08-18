/** Package-owned invariant companion for the Remote Access lifecycle service. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-access'

/** Cordis companion plugin name. */
export const name = 'remote-access-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the provider owns no external mutable relationship or event stream. */
const install: InvariantInstaller = () => {}

/** Register Remote Access package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
