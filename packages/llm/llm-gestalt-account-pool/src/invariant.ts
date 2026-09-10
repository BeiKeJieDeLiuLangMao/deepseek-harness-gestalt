/** Package-owned invariant companion for the account-pool adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-gestalt-account-pool'
export const name = 'llm-gestalt-account-pool-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: this adapter owns no independent event stream or
 * mutable data beyond LLM registry contracts already asserted by dsh-llm.
 */
const install: InvariantInstaller = () => {}

/** @returns the invariant registration disposer. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
