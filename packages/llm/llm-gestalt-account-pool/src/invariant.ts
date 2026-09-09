/** Package-owned invariant companion for the account-pool adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-gestalt-account-pool'
export const name = 'llm-gestalt-account-pool-invariant'
export const inject = ['invariants']

/** No independent event or mutable relation exists beyond the LLM registry contracts. */
const install: InvariantInstaller = () => {}

/** @returns the invariant registration disposer. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
