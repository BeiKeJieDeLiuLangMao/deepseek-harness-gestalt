/** Package-owned invariant companion for Platform Account HTTP routes. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-platform-account-http'

/** Cordis companion plugin name. */
export const name = 'platform-account-http-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: webserver rejects duplicate routes and Account owns session relations. */
const install: InvariantInstaller = () => {}

/** Register HTTP-consumer package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
