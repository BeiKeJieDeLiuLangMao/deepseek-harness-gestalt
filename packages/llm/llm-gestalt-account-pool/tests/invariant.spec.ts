import { Context } from '@deepseek-ai/cordis'
import InvariantService from '@deepseek-ai/dsh-invariants'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { describe, it } from 'vitest'
import { apply } from '../src/invariant.ts'

describe('gestalt account pool invariant', () => {
  it('accepts the explained empty companion', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(InvariantService)
    await ctx.plugin({ apply, inject: ['invariants'] })
    await ctx.fiber.dispose()
  })
})
