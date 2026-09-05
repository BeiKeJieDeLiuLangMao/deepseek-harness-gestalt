/* eslint-disable no-restricted-properties */
import crypto, { randomUUID as namedRandomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import * as plugin from '../snapshots/session/member-question-routed-ask/memory-member-question.ts'

const originalRandomUUID = crypto.randomUUID
const liveContexts: Context[] = []

function track(ctx: Context): Context {
  liveContexts.push(ctx)
  return ctx
}

function expectNamedBinding(expected: typeof crypto.randomUUID): void {
  expect(crypto.randomUUID).toBe(expected)
  expect(namedRandomUUID).toBe(expected)
}

/** Occupies `memberQuestionSender` so a later fixture install hits the real Cordis provide conflict. */
class OccupiedMemberQuestionSender extends Service {
  constructor(ctx: Context) {
    super(ctx, 'memberQuestionSender')
  }
}

describe('memory-member-question randomUUID lifecycle ownership', () => {
  // Same-module re-apply owns the patch stack and sequence. Cache-busted module reload is not claimed.
  // The suite stays in thread-safe forks; same-file tests run sequentially and afterEach restores the process UUID.
  afterEach(async () => {
    const pending = liveContexts.splice(0).reverse()
    const errors: unknown[] = []
    for (const ctx of pending) {
      try {
        await ctx.fiber.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    expectNamedBinding(originalRandomUUID)
    if (errors[0] !== undefined) throw errors[0]
  })

  it('patches randomUUID on apply and restores original on fiber disposal', async () => {
    const ctx = track(new Context())
    await plugin.apply(ctx)
    expect(crypto.randomUUID).not.toBe(originalRandomUUID)
    expectNamedBinding(crypto.randomUUID)

    const generated = namedRandomUUID()
    expect(generated).toMatch(/^36f683c1-23df-4b88-9d68-[0-9a-f]{12}$/)

    await ctx.fiber.dispose()
    expectNamedBinding(originalRandomUUID)
  })

  it('restores original randomUUID if apply fails', async () => {
    const ctx = track(new Context())
    await ctx.plugin(OccupiedMemberQuestionSender)
    await expect(ctx.plugin(plugin)).rejects.toThrow('service "memberQuestionSender" has been registered')
    expectNamedBinding(originalRandomUUID)
  })

  it('prevents a stale disposer from overwriting a newer same-module owner', async () => {
    const ctxA = track(new Context())
    await plugin.apply(ctxA)
    const patchA = crypto.randomUUID
    expectNamedBinding(patchA)

    const ctxB = track(new Context())
    await plugin.apply(ctxB)
    const patchB = crypto.randomUUID
    expect(patchB).not.toBe(patchA)
    expectNamedBinding(patchB)

    await ctxA.fiber.dispose()
    expectNamedBinding(patchB)

    await ctxB.fiber.dispose()
    expectNamedBinding(originalRandomUUID)
  })

  it('keeps a monotonic sequence across same-module re-applies without duplicate IDs', async () => {
    const ctx1 = track(new Context())
    await plugin.apply(ctx1)
    const id1 = namedRandomUUID()

    const ctx2 = track(new Context())
    await plugin.apply(ctx2)
    const id2 = namedRandomUUID()

    expect(id1).not.toBe(id2)

    await ctx1.fiber.dispose()
    await ctx2.fiber.dispose()
    expectNamedBinding(originalRandomUUID)
  })

  it('supports plugin re-registration without leaking patched state after final teardown', async () => {
    const root = track(new Context())

    const fork1 = root.plugin(plugin)
    await fork1
    const id1 = namedRandomUUID()
    expect(id1).toMatch(/^36f683c1-23df-4b88-9d68-[0-9a-f]{12}$/)
    expectNamedBinding(crypto.randomUUID)

    await fork1.dispose()
    expectNamedBinding(originalRandomUUID)

    const fork2 = root.plugin(plugin)
    await fork2
    const id2 = namedRandomUUID()
    expect(id2).not.toBe(id1)
    expectNamedBinding(crypto.randomUUID)

    await fork2.dispose()
    await root.fiber.dispose()
    expectNamedBinding(originalRandomUUID)
  })
})
