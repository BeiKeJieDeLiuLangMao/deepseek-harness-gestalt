/** Package-owned invariant companion for Platform Account Service Definition. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-platform-account'

/** Cordis companion plugin name. */
export const name = 'platform-account-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the definition owns no state or event stream. */
const install: InvariantInstaller = () => {}

/** Register definition-package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
