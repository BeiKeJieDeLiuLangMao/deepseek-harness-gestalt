import { describe, expect, it, vi } from 'vitest'
import {
  bindDesktopUpdater, createUpdaterSource, INITIAL_UPDATER_STATUS,
} from '../src/client/status-source.ts'

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

  it('contains subscriber failures and keeps notifying later subscribers', () => {
    const report = vi.fn()
    const source = createUpdaterSource(report)
    source.subscribe(() => { throw new Error('gone') })
    const later = vi.fn()
    source.subscribe(later)

    source.set({ state: 'idle', lastCheckedAt: 1 })

    expect(report).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledOnce()
  })

  it('keeps a pushed state when the initial read resolves late', async () => {
    let resolveInitial: ((status: typeof INITIAL_UPDATER_STATUS) => void) | undefined
    let push: ((status: typeof INITIAL_UPDATER_STATUS) => void) | undefined
    const source = createUpdaterSource()
    const stop = bindDesktopUpdater(source, {
      getStatus: () => new Promise((resolve) => { resolveInitial = resolve }),
      onStatus: (listener) => {
        push = listener
        return vi.fn()
      },
    })
    push?.({ state: 'disabled', lastCheckedAt: null })
    resolveInitial?.(INITIAL_UPDATER_STATUS)
    await Promise.resolve()

    expect(source.getSnapshot().state).toBe('disabled')
    stop()
  })

  it('reports initial read failures and ignores writes after disposal', async () => {
    let push: ((status: typeof INITIAL_UPDATER_STATUS) => void) | undefined
    const report = vi.fn()
    const unsubscribe = vi.fn()
    const source = createUpdaterSource()
    const stop = bindDesktopUpdater(source, {
      getStatus: () => Promise.reject(new Error('ipc gone')),
      onStatus: (listener) => {
        push = listener
        return unsubscribe
      },
    }, report)
    stop()
    push?.({ state: 'disabled', lastCheckedAt: null })
    await Promise.resolve()
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual(INITIAL_UPDATER_STATUS)
    expect(report).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
