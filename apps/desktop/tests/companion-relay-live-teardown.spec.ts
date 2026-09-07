/** Teardown error collection shared with the assembled live spec. */

import { describe, expect, it, vi } from 'vitest'
import { runTeardown } from './teardown-collector.ts'

describe('afterEach teardown error collection', () => {
  it('keeps draining after a cleanup fails and reports every error in execution order', async () => {
    // Registration order [later, thrower]: reverse drains thrower first, so
    // the failure happens before the remaining cleanup and the final stop —
    // removing the per-entry catch would leave 'later' and 'stop' unrun.
    const order: string[] = []
    const later = vi.fn(() => { order.push('later') })
    const thrower = vi.fn(() => {
      order.push('thrower')
      throw new Error('cleanup failed')
    })
    const stop = vi.fn(() => {
      order.push('stop')
      throw new Error('host stop failed')
    })
    await expect(runTeardown([later, thrower], stop)).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        expect.objectContaining({ message: 'cleanup failed' }),
        expect.objectContaining({ message: 'host stop failed' }),
      ],
    })
    expect(order).toEqual(['thrower', 'later', 'stop'])
  })

  it('rethrows a single cleanup failure directly and still runs the rest', async () => {
    const order: string[] = []
    const later = vi.fn(() => { order.push('later') })
    const thrower = vi.fn(() => {
      order.push('thrower')
      throw new Error('only failure')
    })
    await expect(runTeardown([later, thrower], () => { order.push('stop') })).rejects.toThrow('only failure')
    expect(order).toEqual(['thrower', 'later', 'stop'])
  })
})
