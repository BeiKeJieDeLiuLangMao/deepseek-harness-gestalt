import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { InvariantRegistry } from '@deepseek-ai/dsh-invariants'
import * as PhoneInvariant from '../src/invariant.ts'

describe('ui-phone invariant companion', () => {
  it('reserves package ownership under its declared companion name', () => {
    expect(PhoneInvariant.name).toBe('client-ui-phone-invariant')
    expect(PhoneInvariant.inject).toEqual(['invariants'])
  })

  it('validates the official singleton definition', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true }).await()
    await expect(ctx.plugin(PhoneInvariant).await()).resolves.toBeDefined()
  })

  it('registers the package-owned invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true }).await()
    const register = vi.spyOn(ctx.invariants, 'register')
    PhoneInvariant.apply(ctx)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-phone', expect.any(Function))
  })
})
