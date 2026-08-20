/** Package-owned invariant companion for the encrypted attachment blob store. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-remote-attachments'

/** Cordis companion plugin name. */
export const name = 'remote-attachments-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: blob and capability removal is the store's own mutation
 * path; every removal route and the expiry sweep are covered by package specs.
 */
const install: InvariantInstaller = () => {}

/** Register Consumer package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
