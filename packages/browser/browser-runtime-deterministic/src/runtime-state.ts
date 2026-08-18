/**
 * Package-private authoritative-state sharing for the deterministic Provider and its invariant.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic/runtime-state
 */

import type { BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'

/** Symbol carried by a deterministic Provider proxy to identify one concrete generation. */
export const RUNTIME_STATE_OWNER: unique symbol = Symbol('browser-runtime-deterministic.state-owner')

/** Opaque identity for one deterministic Provider generation. */
export type RuntimeStateOwner = object

/** Synchronous read of one Provider generation's authoritative state. */
export type RuntimeStateReader = () => BrowserRuntimeState | undefined

/** Synchronous pre-commit validation of one Provider generation's next state. */
export type RuntimeStateValidator = (state: BrowserRuntimeState) => undefined

/** Identity-bearing registry entry so stale disposers cannot delete replacements. */
interface Registration<T> {
  readonly value: T
}

const readers = new WeakMap<RuntimeStateOwner, Registration<RuntimeStateReader>>()
const validators = new WeakMap<RuntimeStateOwner, Registration<RuntimeStateValidator>>()

/**
 * Register the authoritative state reader for one deterministic Provider.
 * @param owner - concrete deterministic Provider generation.
 * @param read - synchronous read of the Provider's current state.
 * @returns disposer for this exact registration.
 * @throws when the generation already has a reader.
 */
export function registerRuntimeStateReader(
  owner: RuntimeStateOwner,
  read: RuntimeStateReader,
): () => void {
  if (readers.has(owner)) {
    throw new Error('browser-runtime-deterministic: the Provider generation already registered a state reader')
  }
  const registration = Object.freeze({ value: read })
  readers.set(owner, registration)
  return () => {
    if (readers.get(owner) === registration) readers.delete(owner)
  }
}

/**
 * Resolve the authoritative state reader for one deterministic Provider.
 * @param owner - concrete deterministic Provider generation.
 * @returns the registered reader, or `undefined` for a different Provider implementation.
 */
export function runtimeStateReader(
  owner: RuntimeStateOwner,
): RuntimeStateReader | undefined {
  return readers.get(owner)?.value
}

/**
 * Register one synchronous pre-commit validator for a deterministic Provider generation.
 * @param owner - concrete deterministic Provider generation with an active reader.
 * @param validate - synchronous validation run before authoritative state assignment.
 * @returns disposer for this exact registration.
 * @throws when the reader is missing or the generation already has a validator.
 */
export function registerRuntimeStateValidator(
  owner: RuntimeStateOwner,
  validate: RuntimeStateValidator,
): () => void {
  if (!readers.has(owner)) {
    throw new Error('browser-runtime-deterministic: the Provider generation has no state reader')
  }
  if (validators.has(owner)) {
    throw new Error('browser-runtime-deterministic: the Provider generation already registered a state validator')
  }
  const registration = Object.freeze({ value: validate })
  validators.set(owner, registration)
  return () => {
    if (validators.get(owner) === registration) validators.delete(owner)
  }
}

/**
 * Resolve the synchronous pre-commit validator for one deterministic Provider generation.
 * @param owner - concrete deterministic Provider generation.
 * @returns the registered validator, or `undefined` when invariant diagnostics are not mounted.
 */
export function runtimeStateValidator(
  owner: RuntimeStateOwner,
): RuntimeStateValidator | undefined {
  return validators.get(owner)?.value
}
