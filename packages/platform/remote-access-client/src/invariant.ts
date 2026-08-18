/** Package-owned invariant companion for the Personal Pairing HTTP client. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-access-client'

/** Cordis companion plugin name. */
export const name = 'remote-access-client-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: each transport owns only immutable deployment configuration. */
const install: InvariantInstaller = () => {}

/** Register client-library package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
