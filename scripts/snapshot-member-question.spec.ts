/* eslint-disable no-restricted-properties */
import crypto from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as plugin from '../snapshots/session/member-question-routed-ask/memory-member-question.ts'

describe('memory-member-question randomUUID lifecycle ownership', () => {
  it('patches randomUUID on apply and restores original on fiber disposal', async () => {
    const originalRandomUUID = crypto.randomUUID
    const ctx = new Context()

    await plugin.apply(ctx)
    expect(crypto.randomUUID).not.toBe(originalRandomUUID)

    const generated = crypto.randomUUID()
    expect(generated).toMatch(/^36f683c1-23df-4b88-9d68-[0-9a-f]{12}$/)

    await ctx.fiber.dispose()
    expect(crypto.randomUUID).toBe(originalRandomUUID)
  })

  it('restores original randomUUID if apply fails', async () => {
    const originalRandomUUID = crypto.randomUUID
    const failingCtx = new Context()

    // Induce failure during apply by invalidating context state or registering conflict
    failingCtx.effect = () => {
      throw new Error('simulated apply failure')
    }

    await expect(plugin.apply(failingCtx)).rejects.toThrow('simulated apply failure')
    expect(crypto.randomUUID).toBe(originalRandomUUID)
  })

  it('prevents stale disposer from overwriting a newer owner on reload', async () => {
    const originalRandomUUID = crypto.randomUUID

    const ctxA = new Context()
    await plugin.apply(ctxA)
    const patchA = crypto.randomUUID

    const ctxB = new Context()
    await plugin.apply(ctxB)
    const patchB = crypto.randomUUID
    expect(patchB).not.toBe(patchA)

    // Dispose ctxA (stale disposer from first registration)
    await ctxA.fiber.dispose()
    // Must NOT revert to original while ctxB is active owner
    expect(crypto.randomUUID).toBe(patchB)

    // Dispose ctxB (current owner)
    await ctxB.fiber.dispose()
    // Now restored to original
    expect(crypto.randomUUID).toBe(originalRandomUUID)
  })

  it('maintains monotonic sequence across reloads without duplicate IDs', async () => {
    const originalRandomUUID = crypto.randomUUID

    const ctx1 = new Context()
    await plugin.apply(ctx1)
    const id1 = crypto.randomUUID()

    const ctx2 = new Context()
    await plugin.apply(ctx2)
    const id2 = crypto.randomUUID()

    expect(id1).not.toBe(id2)

    await ctx1.fiber.dispose()
    await ctx2.fiber.dispose()
    expect(crypto.randomUUID).toBe(originalRandomUUID)
  })

  it('supports plugin re-registration without leaking patched state after final teardown', async () => {
    const originalRandomUUID = crypto.randomUUID
    const root = new Context()

    const fork1 = root.plugin(plugin)
    await fork1
    const id1 = crypto.randomUUID()
    expect(id1).toMatch(/^36f683c1-23df-4b88-9d68-[0-9a-f]{12}$/)

    // Dispose first fork
    await fork1.dispose()
    expect(crypto.randomUUID).toBe(originalRandomUUID)

    // Re-register plugin in root (simulating reload cycle)
    const fork2 = root.plugin(plugin)
    await fork2
    const id2 = crypto.randomUUID()
    expect(id2).not.toBe(id1)

    // Dispose second fork
    await fork2.dispose()
    await root.fiber.dispose()
    expect(crypto.randomUUID).toBe(originalRandomUUID)
  })
})
