import { describe, expect, it, vi } from 'vitest'
import { createUpdaterSource, INITIAL_UPDATER_STATUS } from '../src/client/status-source.ts'

describe('createUpdaterSource', () => {
  it('starts idle and notifies subscribers on set', () => {
    const source = createUpdaterSource()
    expect(source.getSnapshot()).toEqual(INITIAL_UPDATER_STATUS)
    const listener = vi.fn()
    const stop = source.subscribe(listener)
    source.set({ state: 'available', lastCheckedAt: 2, newVersion: '0.1.1' })
    expect(source.getSnapshot().state).toBe('available')
    expect(listener).toHaveBeenCalledOnce()
    stop()
    source.set({ state: 'idle', lastCheckedAt: 3 })
    expect(listener).toHaveBeenCalledOnce()
  })
})
