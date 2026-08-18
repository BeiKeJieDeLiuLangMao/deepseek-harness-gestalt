/** Package-owned lifecycle invariant for the Tandem Browser Runtime Provider. @module @deepseek-ai/dsh-browser-runtime-tandem/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { BrowserRuntime, BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'
import { browserTargetKey, sameBrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import {
  registerTandemRuntimeStateValidator,
  TANDEM_RUNTIME_STATE_OWNER,
  tandemRuntimeStateReader,
  type TandemRuntimeStateOwner,
} from './runtime-state.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-browser-runtime-tandem'

/** Cordis companion plugin name. */
export const name = 'browser-runtime-tandem-invariant'
/** Services required before this companion can observe its Provider. */
export const inject = ['invariants']

/** Validate one open-to-closed Tandem lifecycle with exact revision succession. */
const install: InvariantInstaller = Object.assign((_ctx: Context, fail: InvariantFailure) => {
  const owner = (_ctx.browserRuntime as BrowserRuntime & {
    readonly [TANDEM_RUNTIME_STATE_OWNER]?: TandemRuntimeStateOwner
  })[TANDEM_RUNTIME_STATE_OWNER]
  if (owner === undefined) fail('the Tandem Browser Runtime invariant requires its own Provider implementation')
  const readState = tandemRuntimeStateReader(owner)
  if (readState === undefined) fail('the Tandem Browser Runtime invariant requires its Provider state reader')
  const previousByTarget = new Map<string, BrowserRuntimeState>(readState())
  _ctx.effect(() => registerTandemRuntimeStateValidator(owner, (state) => {
    const key = browserTargetKey(state.target)
    const previous = previousByTarget.get(key)
    const sibling = [...previousByTarget.values()].find(candidate => (
      candidate.status === 'open'
      && candidate.target.profileId === state.target.profileId
      && !sameBrowserTarget(candidate.target, state.target)
    ))
    if (sibling !== undefined) fail('a Tandem Browser Runtime lifecycle changed an opaque target identity')
    if (previous === undefined) {
      if (state.status !== 'open' || state.revision !== 0) fail('a Tandem Browser Runtime lifecycle must begin with an open revision 0 state')
      previousByTarget.set(key, state)
      return undefined
    }
    if (previous.status === 'closed') fail('a Tandem Browser Runtime terminal state cannot reopen')
    if (state.revision !== previous.revision + 1) {
      fail(`Tandem Browser Runtime revision ${String(state.revision)} must follow ${String(previous.revision)}`)
    }
    previousByTarget.set(key, state)
    return undefined
  }), 'Tandem Browser Runtime pre-commit validator')
}, { inject: ['browserRuntime'] })

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
