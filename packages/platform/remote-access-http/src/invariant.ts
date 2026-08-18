/** Package-owned invariant companion for the Remote Access HTTP consumer. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-access-http'

/** Cordis companion plugin name. */
export const name = 'remote-access-http-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: route registration is owned by Host WebServer effects. */
const install: InvariantInstaller = () => {}

/** Register Consumer package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
