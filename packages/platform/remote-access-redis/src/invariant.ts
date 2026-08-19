/** Package-owned invariant companion for the Redis Relay coordinator. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-access-redis'

/** Cordis companion plugin name. */
export const name = 'remote-access-redis-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: each Redis operation directly verifies its external token or parsed value. */
const install: InvariantInstaller = () => {}

/** Register Redis Relay adapter ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
