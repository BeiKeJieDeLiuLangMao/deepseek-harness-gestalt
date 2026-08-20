import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import * as companion from '../src/invariant.ts'

describe('Remote Attachments invariant companion', () => {
  it('registers the package and its intentionally empty installer', async () => {
    const dispose = vi.fn()
    const register = vi.fn((_name: string, install: InvariantInstaller) => {
      const fail: InvariantFailure = (message) => { throw new Error(message) }
      void install({} as Context, fail)
      return dispose
    })
    const registered = await companion.apply({ invariants: { register } } as never)
    expect(companion.name).toBe('remote-attachments-invariant')
    expect(companion.inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-remote-attachments', expect.any(Function))
    registered()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
