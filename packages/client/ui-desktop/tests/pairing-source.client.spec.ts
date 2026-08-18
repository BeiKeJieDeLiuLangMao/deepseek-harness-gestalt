import { describe, expect, it, vi } from 'vitest'
import {
  bindDesktopPairing, createDesktopPairingSource, INITIAL_PAIRING_SNAPSHOT,
} from '../src/client/pairing-source.ts'

describe('createDesktopPairingSource', () => {
  it('starts disabled and notifies subscribers on set', () => {
    const source = createDesktopPairingSource()
    expect(source.getSnapshot()).toEqual(INITIAL_PAIRING_SNAPSHOT)
    const listener = vi.fn()
    const stop = source.subscribe(listener)
    source.set({ status: 'ready', enabled: true, pairings: [] })
    expect(source.getSnapshot()).toEqual({ status: 'ready', enabled: true, pairings: [] })
    expect(listener).toHaveBeenCalledOnce()
    stop()
    source.set(INITIAL_PAIRING_SNAPSHOT)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('contains subscriber failures and keeps notifying later subscribers', () => {
    const report = vi.fn()
    const source = createDesktopPairingSource(report)
    source.subscribe(() => { throw new Error('gone') })
    const later = vi.fn()
    source.subscribe(later)

    source.set({ status: 'ready', enabled: false, pairings: [] })

    expect(report).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledOnce()
  })

  it('reports subscriber and initial-read failures through the default diagnostics', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = createDesktopPairingSource()
    source.subscribe(() => { throw new Error('subscriber gone') })
    source.set(INITIAL_PAIRING_SNAPSHOT)
    bindDesktopPairing(source, {
      pairingGetSnapshot: () => Promise.reject(new Error('ipc gone')),
      onPairingSnapshot: () => () => {},
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('keeps a pushed state when the initial read resolves late', async () => {
    let resolveInitial: ((snapshot: typeof INITIAL_PAIRING_SNAPSHOT) => void) | undefined
    let push: ((snapshot: typeof INITIAL_PAIRING_SNAPSHOT) => void) | undefined
    const source = createDesktopPairingSource()
    const stop = bindDesktopPairing(source, {
      pairingGetSnapshot: () => new Promise((resolve) => { resolveInitial = resolve }),
      onPairingSnapshot: (listener) => {
        push = listener
        return vi.fn()
      },
    })
    push?.({ status: 'unavailable', enabled: false, pairings: [], error: 'review pending' })
    resolveInitial?.(INITIAL_PAIRING_SNAPSHOT)
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual({
      status: 'unavailable', enabled: false, pairings: [], error: 'review pending',
    })
    stop()
  })

  it('applies an initial read when no push wins', async () => {
    const source = createDesktopPairingSource()
    bindDesktopPairing(source, {
      pairingGetSnapshot: async () => ({ status: 'ready', enabled: false, pairings: [] }),
      onPairingSnapshot: () => () => {},
    })
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual({ status: 'ready', enabled: false, pairings: [] })
  })

  it('reports a live initial read failure and ignores writes after disposal', async () => {
    const liveReport = vi.fn()
    bindDesktopPairing(createDesktopPairingSource(), {
      pairingGetSnapshot: () => Promise.reject(new Error('live ipc gone')),
      onPairingSnapshot: () => () => {},
    }, liveReport)
    await Promise.resolve()
    await Promise.resolve()
    expect(liveReport).toHaveBeenCalledOnce()

    let push: ((snapshot: typeof INITIAL_PAIRING_SNAPSHOT) => void) | undefined
    const disposedReport = vi.fn()
    const unsubscribe = vi.fn()
    const source = createDesktopPairingSource()
    const stop = bindDesktopPairing(source, {
      pairingGetSnapshot: () => Promise.reject(new Error('disposed ipc gone')),
      onPairingSnapshot: (listener) => {
        push = listener
        return unsubscribe
      },
    }, disposedReport)
    stop()
    push?.(INITIAL_PAIRING_SNAPSHOT)
    await Promise.resolve()
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual(INITIAL_PAIRING_SNAPSHOT)
    expect(disposedReport).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
