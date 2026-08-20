/**
 * Authoritative-state registry shared by the Electron Provider and its invariant.
 * @module @deepseek-ai/dsh-browser-runtime-electron/runtime-state
 */

/* jscpd:ignore-start */

import type { BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'

/** Symbol identifying one concrete Electron Provider generation. */
export const ELECTRON_RUNTIME_STATE_OWNER: unique symbol = Symbol('browser-runtime-electron.state-owner')
/** Opaque identity for one Electron Provider generation. */
export type ElectronRuntimeStateOwner = object
/** Synchronous read of one Electron Provider generation's authoritative states, keyed by target. */
export type ElectronRuntimeStateReader = () => ReadonlyMap<string, BrowserRuntimeState>
/** Synchronous pre-commit validation of one Electron Provider generation's next state. */
export type ElectronRuntimeStateValidator = (state: BrowserRuntimeState) => undefined

interface Registration<T> {
  readonly value: T
}

const readers = new WeakMap<ElectronRuntimeStateOwner, Registration<ElectronRuntimeStateReader>>()
const validators = new WeakMap<ElectronRuntimeStateOwner, Registration<ElectronRuntimeStateValidator>>()

/**
 * Register one generation's authoritative state reader.
 * @param owner - Concrete Electron Provider generation.
 * @param read - Synchronous read of the Provider's current state.
 * @returns disposer for this exact registration.
 */
export function registerElectronRuntimeStateReader(
  owner: ElectronRuntimeStateOwner,
  read: ElectronRuntimeStateReader,
): () => void {
  if (readers.has(owner)) throw new Error('browser-runtime-electron: the Provider generation already registered a state reader')
  const registration = Object.freeze({ value: read })
  readers.set(owner, registration)
  return () => {
    if (readers.get(owner) === registration) readers.delete(owner)
  }
}

/**
 * Resolve one exact generation's authoritative state reader.
 * @param owner - Concrete Electron Provider generation.
 * @returns the registered reader, or `undefined` for a different Provider implementation.
 */
export function electronRuntimeStateReader(owner: ElectronRuntimeStateOwner): ElectronRuntimeStateReader | undefined {
  return readers.get(owner)?.value
}

/**
 * Register one generation's synchronous pre-commit validator.
 * @param owner - Concrete Electron Provider generation with an active reader.
 * @param validate - Synchronous validation run before authoritative state assignment.
 * @returns disposer for this exact registration.
 */
export function registerElectronRuntimeStateValidator(
  owner: ElectronRuntimeStateOwner,
  validate: ElectronRuntimeStateValidator,
): () => void {
  if (!readers.has(owner)) throw new Error('browser-runtime-electron: the Provider generation has no state reader')
  if (validators.has(owner)) throw new Error('browser-runtime-electron: the Provider generation already registered a state validator')
  const registration = Object.freeze({ value: validate })
  validators.set(owner, registration)
  return () => {
    if (validators.get(owner) === registration) validators.delete(owner)
  }
}

/**
 * Resolve one exact generation's synchronous pre-commit validator.
 * @param owner - Concrete Electron Provider generation.
 * @returns the registered validator, or `undefined` when invariant diagnostics are not mounted.
 */
export function electronRuntimeStateValidator(owner: ElectronRuntimeStateOwner): ElectronRuntimeStateValidator | undefined {
  return validators.get(owner)?.value
}
/* jscpd:ignore-end */
