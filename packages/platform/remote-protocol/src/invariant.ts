/** Package-owned invariant companion for the pure Remote Protocol codecs. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-protocol'

/** Cordis companion plugin name. */
export const name = 'remote-protocol-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: codecs and negotiation tokens own no mutable state or event stream. */
const install: InvariantInstaller = () => {}

/** Register definition-package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
