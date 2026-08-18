/**
 * Package-private authoritative-state sharing for the deterministic Provider and its invariant.
 * @module @deepseek-ai/dsh-browser-runtime-deterministic/runtime-state
 */

import type { Context } from '@deepseek-ai/cordis'
import type { BrowserRuntimeState } from '@deepseek-ai/dsh-browser-runtime'

/** Package-private readers expose each deterministic Provider's authoritative state to its invariant companion. */
const readers = new WeakMap<Context, () => BrowserRuntimeState | undefined>()

/**
 * Register the authoritative state reader for one deterministic Provider.
 * @param root - shared Cordis root containing the Provider.
 * @param read - synchronous read of the Provider's current state.
 * @returns disposer for this exact registration.
 */
export function registerRuntimeStateReader(
  root: Context,
  read: () => BrowserRuntimeState | undefined,
): () => void {
  readers.set(root, read)
  return () => { readers.delete(root) }
}

/**
 * Resolve the authoritative state reader for one deterministic Provider.
 * @param root - shared Cordis root containing the Provider.
 * @returns the registered reader, or `undefined` for a different Provider implementation.
 */
export function runtimeStateReader(
  root: Context,
): (() => BrowserRuntimeState | undefined) | undefined {
  return readers.get(root)
}
