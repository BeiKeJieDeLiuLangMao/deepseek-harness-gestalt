/**
 * Package-owned lifecycle invariant for the deterministic Browser Runtime Provider.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserRuntime, BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'
import { browserTargetKey, sameBrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
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
  const previousByTarget = new Map<string, BrowserRuntimeState>(readState())
  _ctx.effect(() => registerRuntimeStateValidator(owner, (state) => {
    const key = browserTargetKey(state.target)
    const previous = previousByTarget.get(key)
    const sibling = [...previousByTarget.values()].find(candidate => (
      candidate.status === 'open'
      && candidate.target.profileId === state.target.profileId
      && !sameBrowserTarget(candidate.target, state.target)
    ))
    if (sibling !== undefined) {
      fail('a deterministic Browser Runtime lifecycle changed an opaque target identity')
    }
    if (previous === undefined) {
      if (state.status !== 'open' || state.revision !== 0) {
        fail('a deterministic Browser Runtime lifecycle must begin with an open revision 0 state')
      }
      previousByTarget.set(key, state)
      return undefined
    }
    if (previous.status === 'closed') {
      fail('a deterministic Browser Runtime terminal state cannot reopen')
    }
    if (state.status === 'unavailable') {
      fail('a deterministic Browser Runtime cannot publish an unavailable state')
    }
    if (state.revision !== previous.revision + 1) {
      fail(`deterministic Browser Runtime revision ${String(state.revision)} must follow ${String(previous.revision)}`)
    }
    previousByTarget.set(key, state)
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
