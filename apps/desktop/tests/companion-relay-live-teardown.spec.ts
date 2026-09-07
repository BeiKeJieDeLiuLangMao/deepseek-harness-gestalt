/** Teardown error collection shared with the assembled live spec. */

import { describe, expect, it, vi } from 'vitest'
import { runTeardown } from './teardown-collector.ts'

describe('afterEach teardown error collection', () => {
  it('runs the later-registered cleanup after an earlier one fails and reports the aggregate', async () => {
    // Registration order [thrower, later]: reverse runs later first, then the
    // thrower — proving a failure never skips what still follows it, and the
    // final stop concern is attempted after both.
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
    await expect(runTeardown([thrower, later], stop)).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        // Execution order: thrower runs after later and fails first; the stop
        // concern is attempted last, so its error lands second.
        expect.objectContaining({ message: 'cleanup failed' }),
        expect.objectContaining({ message: 'host stop failed' }),
      ],
    })
    expect(order).toEqual(['later', 'thrower', 'stop'])
  })

  it('rethrows a single cleanup failure directly and still runs the rest', async () => {
    const order: string[] = []
    const later = vi.fn(() => { order.push('later') })
    const thrower = vi.fn(() => {
      order.push('thrower')
      throw new Error('only failure')
    })
    await expect(runTeardown([thrower, later], () => { order.push('stop') })).rejects.toThrow('only failure')
    expect(order).toEqual(['later', 'thrower', 'stop'])
  })
})
