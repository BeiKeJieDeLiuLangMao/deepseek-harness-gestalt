import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject, name } from '../src/invariant.ts'

describe('cliproxy-quota invariant companion', () => {
  it('registers the package name and runs the empty installer', async () => {
    const registrations: string[] = []
    let disposed = false
    const ctx = {
      invariants: {
        register: (packageName: string, install: () => void) => {
          registrations.push(packageName)
          install()
          return () => {
            disposed = true
          }
        },
      },
    }

    const dispose = await apply(ctx as unknown as Context)
    expect(registrations).toEqual(['@deepseek-ai/dsh-cliproxy-quota'])
    dispose()
    expect(disposed).toBe(true)
  })

  it('declares its cordis identity', () => {
    expect(name).toBe('cliproxy-quota-invariant')
    expect(inject).toEqual(['invariants'])
  })
})
