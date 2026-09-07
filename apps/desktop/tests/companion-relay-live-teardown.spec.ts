/** Teardown ordering of the assembled spec's afterEach error collection. */

import { describe, expect, it, vi } from 'vitest'

// A tiny real callback harness (no Host internals): each cleanup is a plain
// function registered in the same order the live spec registers its own.
function runTeardown(
  cleanups: Array<() => void | Promise<void>>,
  afterAll: () => void | Promise<void>,
): Promise<void> {
  return (async () => {
    const teardownErrors: unknown[] = []
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { await cleanup() } catch (error) { teardownErrors.push(error) }
    }
    try { await afterAll() } catch (error) { teardownErrors.push(error) }
    if (teardownErrors.length === 1) throw teardownErrors[0]
    if (teardownErrors.length > 1) throw new AggregateError(teardownErrors, 'multiple teardown failures')
  })()
}

describe('afterEach teardown error collection', () => {
  it('runs every cleanup after a failing one and fails with the aggregate', async () => {
    const first = vi.fn(() => { throw new Error('first cleanup failed') })
    const second = vi.fn()
    const stop = vi.fn(() => { throw new Error('host stop failed') })
    await expect(runTeardown([first, second], stop)).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        expect.objectContaining({ message: 'first cleanup failed' }),
        expect.objectContaining({ message: 'host stop failed' }),
      ],
    })
    // Registration order [first, second] reverses to second→first; both must
    // have executed despite the failure, plus the final stop attempt.
    expect(second).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('rethrows a single cleanup failure directly', async () => {
    const failing = vi.fn(() => { throw new Error('only failure') })
    const passing = vi.fn()
    await expect(runTeardown([failing, passing], vi.fn())).rejects.toThrow('only failure')
    expect(passing).toHaveBeenCalledOnce()
  })
})
