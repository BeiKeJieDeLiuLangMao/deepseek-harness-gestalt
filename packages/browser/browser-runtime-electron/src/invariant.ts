/**
 * Package-owned lifecycle invariant for the Electron Browser Runtime Provider.
 * @module @deepseek-ai/dsh-browser-runtime-electron/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserRuntime, BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'
import { browserTargetKey } from '@deepseek-ai/dsh-browser-runtime'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import {
  ELECTRON_RUNTIME_STATE_OWNER,
  electronRuntimeStateReader,
  registerElectronRuntimeStateValidator,
  type ElectronRuntimeStateOwner,
} from './runtime-state.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-browser-runtime-electron'

/** Cordis companion plugin name. */
export const name = 'browser-runtime-electron-invariant'
/** Services required before this companion can observe its Provider. */
export const inject = ['invariants']

/** Validate one open-to-closed Electron lifecycle with exact revision succession. */
const install: InvariantInstaller = Object.assign((_ctx: Context, fail: InvariantFailure) => {
  const owner = (_ctx.browserRuntime as BrowserRuntime & {
    readonly [ELECTRON_RUNTIME_STATE_OWNER]?: ElectronRuntimeStateOwner
  })[ELECTRON_RUNTIME_STATE_OWNER]
  if (owner === undefined) fail('the Electron Browser Runtime invariant requires its own Provider implementation')
  const readState = electronRuntimeStateReader(owner)
  if (readState === undefined) fail('the Electron Browser Runtime invariant requires its Provider state reader')
  const previousByTarget = new Map<string, BrowserRuntimeState>(readState())
  _ctx.effect(() => registerElectronRuntimeStateValidator(owner, (state) => {
    const key = browserTargetKey(state.target)
    const previous = previousByTarget.get(key)
    if (previous === undefined) {
      if (state.status !== 'open' || state.revision !== 0) fail('an Electron Browser Runtime lifecycle must begin with an open revision 0 state')
      previousByTarget.set(key, state)
      return undefined
    }
    if (previous.status === 'closed') fail('an Electron Browser Runtime terminal state cannot reopen')
    if (state.revision !== previous.revision + 1) {
      fail(`Electron Browser Runtime revision ${String(state.revision)} must follow ${String(previous.revision)}`)
    }
    previousByTarget.set(key, state)
    return undefined
  }), 'Electron Browser Runtime pre-commit validator')
}, { inject: ['browserRuntime'] })

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
