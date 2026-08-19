import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import * as service from '../src/invariant.ts'
import * as client from '../../remote-access-client/src/invariant.ts'
import * as http from '../../remote-access-http/src/invariant.ts'
import * as redis from '../../remote-access-redis/src/invariant.ts'

describe('Remote Access invariant companions', () => {
  it('registers each capability package and its intentionally empty installer', async () => {
    const expected = [
      [service, '@deepseek-ai/dsh-remote-access'],
      [client, '@deepseek-ai/dsh-remote-access-client'],
      [http, '@deepseek-ai/dsh-remote-access-http'],
      [redis, '@deepseek-ai/dsh-remote-access-redis'],
    ] as const
    for (const [companion, packageName] of expected) {
      const dispose = vi.fn()
      const register = vi.fn((_name: string, install: InvariantInstaller) => {
        const fail: InvariantFailure = (message) => { throw new Error(message) }
        void install({} as Context, fail)
        return dispose
      })
      const registered = await companion.apply({ invariants: { register } } as never)
      expect(companion.name).toContain('remote-access')
      expect(companion.inject).toEqual(['invariants'])
      expect(register).toHaveBeenCalledWith(packageName, expect.any(Function))
      registered()
      expect(dispose).toHaveBeenCalledOnce()
    }
  })
})
