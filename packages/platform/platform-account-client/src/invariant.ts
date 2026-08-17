/** Package-owned invariant companion for the installation Account client. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-platform-account-client'

/** Cordis companion plugin name. */
export const name = 'platform-account-client-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: each controller owns private adapter state and exposes one snapshot. */
const install: InvariantInstaller = () => {}

/** Register client-library package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
