/**
 * Authoritative-state registry shared by the Tandem Provider and its invariant.
 * @module @deepseek-ai/dsh-browser-runtime-tandem/runtime-state
 */

import type { BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'

/** Symbol identifying one concrete Tandem Provider generation. */
export const TANDEM_RUNTIME_STATE_OWNER: unique symbol = Symbol('browser-runtime-tandem.state-owner')
/** Opaque identity for one Tandem Provider generation. */
export type TandemRuntimeStateOwner = object
/** Synchronous read of one Tandem Provider generation's authoritative state. */
export type TandemRuntimeStateReader = () => BrowserRuntimeState | undefined
/** Synchronous pre-commit validation of one Tandem Provider generation's next state. */
export type TandemRuntimeStateValidator = (state: BrowserRuntimeState) => undefined

interface Registration<T> {
  readonly value: T
}

const readers = new WeakMap<TandemRuntimeStateOwner, Registration<TandemRuntimeStateReader>>()
const validators = new WeakMap<TandemRuntimeStateOwner, Registration<TandemRuntimeStateValidator>>()

/** Register one generation's authoritative state reader. */
export function registerTandemRuntimeStateReader(
  owner: TandemRuntimeStateOwner,
  read: TandemRuntimeStateReader,
): () => void {
  if (readers.has(owner)) throw new Error('browser-runtime-tandem: the Provider generation already registered a state reader')
  const registration = Object.freeze({ value: read })
  readers.set(owner, registration)
  return () => {
    if (readers.get(owner) === registration) readers.delete(owner)
  }
}

/** Resolve one exact generation's authoritative state reader. */
export function tandemRuntimeStateReader(owner: TandemRuntimeStateOwner): TandemRuntimeStateReader | undefined {
  return readers.get(owner)?.value
}

/** Register one generation's synchronous pre-commit validator. */
export function registerTandemRuntimeStateValidator(
  owner: TandemRuntimeStateOwner,
  validate: TandemRuntimeStateValidator,
): () => void {
  if (!readers.has(owner)) throw new Error('browser-runtime-tandem: the Provider generation has no state reader')
  if (validators.has(owner)) throw new Error('browser-runtime-tandem: the Provider generation already registered a state validator')
  const registration = Object.freeze({ value: validate })
  validators.set(owner, registration)
  return () => {
    if (validators.get(owner) === registration) validators.delete(owner)
  }
}

/** Resolve one exact generation's synchronous pre-commit validator. */
export function tandemRuntimeStateValidator(owner: TandemRuntimeStateOwner): TandemRuntimeStateValidator | undefined {
  return validators.get(owner)?.value
}
