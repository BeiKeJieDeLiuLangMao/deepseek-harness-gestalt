/**
 * Package-owned lifecycle invariant for the deterministic Browser Runtime Provider.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserRuntime, BrowserRuntimeState, BrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import {
  registerRuntimeStateValidator,
  RUNTIME_STATE_OWNER,
  runtimeStateReader,
  type RuntimeStateOwner,
} from './runtime-state.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-browser-runtime-deterministic'

/** Cordis companion plugin name. */
export const name = 'browser-runtime-deterministic-invariant'
/** Services required before the companion can reserve and observe its package relationship. */
export const inject = ['invariants']

/** Test opaque resource identity equality without weakening the branded Service Definition types. */
function sameTarget(left: BrowserTarget, right: BrowserTarget): boolean {
  return left.profileId === right.profileId
    && left.workspaceId === right.workspaceId
    && left.browserId === right.browserId
    && left.tabId === right.tabId
}

/** Validate lifecycle publications as one open-to-closed revision stream. */
const install: InvariantInstaller = Object.assign((_ctx: Context, fail: InvariantFailure) => {
  const owner = (_ctx.browserRuntime as BrowserRuntime & {
    readonly [RUNTIME_STATE_OWNER]?: RuntimeStateOwner
  })[RUNTIME_STATE_OWNER]
  if (owner === undefined) {
    fail('the deterministic Browser Runtime invariant requires its own Provider implementation')
  }
  const readState = runtimeStateReader(owner)
  if (readState === undefined) {
    fail('the deterministic Browser Runtime invariant requires its Provider state reader')
  }
  let previous: BrowserRuntimeState | undefined = readState()
  _ctx.effect(() => registerRuntimeStateValidator(owner, (state) => {
    if (previous === undefined) {
      if (state.status !== 'open' || state.revision !== 0) {
        fail('a deterministic Browser Runtime lifecycle must begin with an open revision 0 state')
      }
      previous = state
      return undefined
    }
    if (previous.status === 'closed') {
      fail('a deterministic Browser Runtime terminal state cannot reopen')
    }
    if (!sameTarget(previous.target, state.target)) {
      fail('a deterministic Browser Runtime lifecycle changed an opaque target identity')
    }
    if (state.revision !== previous.revision + 1) {
      fail(`deterministic Browser Runtime revision ${String(state.revision)} must follow ${String(previous.revision)}`)
    }
    previous = state
    return undefined
  }), 'deterministic Browser Runtime pre-commit validator')
}, { inject: ['browserRuntime'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Context owning the invariant registry.
 * @returns the exact registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
