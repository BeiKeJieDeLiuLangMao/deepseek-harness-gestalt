/** Package-owned invariant companion for the Snow pairing channel. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-noise-channel'

/** Cordis companion plugin name. */
export const name = 'noise-channel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: handshake state is asserted by official-vector and in-process provider tests. */
const install: InvariantInstaller = () => {}

/** Register Snow channel package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
