/** Package-owned invariant companion for the Platform Account provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-platform-account-core'

/** Cordis companion plugin name. */
export const name = 'platform-account-core-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: backend state is authoritative and checked by each authenticated operation. */
const install: InvariantInstaller = () => {}

/** Register provider-package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
