import { describe, expect, it, vi } from 'vitest'
import {
  bindDesktopAccount, createDesktopAccountSource, INITIAL_ACCOUNT_SNAPSHOT,
} from '../src/client/account-source.ts'

describe('createDesktopAccountSource', () => {
  it('starts unavailable and notifies subscribers on set', () => {
    const source = createDesktopAccountSource()
    expect(source.getSnapshot()).toEqual(INITIAL_ACCOUNT_SNAPSHOT)
    const listener = vi.fn()
    const stop = source.subscribe(listener)
    source.set({ status: 'idle', privacyAccepted: true })
    expect(source.getSnapshot()).toEqual({ status: 'idle', privacyAccepted: true })
    expect(listener).toHaveBeenCalledOnce()
    stop()
    source.set(INITIAL_ACCOUNT_SNAPSHOT)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('contains subscriber failures and keeps notifying later subscribers', () => {
    const report = vi.fn()
    const source = createDesktopAccountSource(report)
    source.subscribe(() => { throw new Error('gone') })
    const later = vi.fn()
    source.subscribe(later)

    source.set({ status: 'idle', privacyAccepted: false })

    expect(report).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledOnce()
  })

  it('reports subscriber and initial-read failures through the default diagnostics', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = createDesktopAccountSource()
    source.subscribe(() => { throw new Error('subscriber gone') })
    source.set(INITIAL_ACCOUNT_SNAPSHOT)
    bindDesktopAccount(source, {
      accountGetSnapshot: () => Promise.reject(new Error('ipc gone')),
      onAccountSnapshot: () => () => {},
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('keeps a pushed state when the initial read resolves late', async () => {
    let resolveInitial: ((snapshot: typeof INITIAL_ACCOUNT_SNAPSHOT) => void) | undefined
    let push: ((snapshot: typeof INITIAL_ACCOUNT_SNAPSHOT) => void) | undefined
    const source = createDesktopAccountSource()
    const stop = bindDesktopAccount(source, {
      accountGetSnapshot: () => new Promise((resolve) => { resolveInitial = resolve }),
      onAccountSnapshot: (listener) => {
        push = listener
        return vi.fn()
      },
    })
    push?.({ status: 'idle', privacyAccepted: true })
    resolveInitial?.(INITIAL_ACCOUNT_SNAPSHOT)
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual({ status: 'idle', privacyAccepted: true })
    stop()
  })

  it('applies an initial read when no push wins', async () => {
    const source = createDesktopAccountSource()
    bindDesktopAccount(source, {
      accountGetSnapshot: async () => ({ status: 'idle', privacyAccepted: false }),
      onAccountSnapshot: () => () => {},
    })
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual({ status: 'idle', privacyAccepted: false })
  })

  it('reports a live initial read failure and ignores writes after disposal', async () => {
    const liveReport = vi.fn()
    bindDesktopAccount(createDesktopAccountSource(), {
      accountGetSnapshot: () => Promise.reject(new Error('live ipc gone')),
      onAccountSnapshot: () => () => {},
    }, liveReport)
    await Promise.resolve()
    await Promise.resolve()
    expect(liveReport).toHaveBeenCalledOnce()

    let push: ((snapshot: typeof INITIAL_ACCOUNT_SNAPSHOT) => void) | undefined
    const disposedReport = vi.fn()
    const unsubscribe = vi.fn()
    const source = createDesktopAccountSource()
    const stop = bindDesktopAccount(source, {
      accountGetSnapshot: () => Promise.reject(new Error('disposed ipc gone')),
      onAccountSnapshot: (listener) => {
        push = listener
        return unsubscribe
      },
    }, disposedReport)
    stop()
    push?.(INITIAL_ACCOUNT_SNAPSHOT)
    await Promise.resolve()
    await Promise.resolve()

    expect(source.getSnapshot()).toEqual(INITIAL_ACCOUNT_SNAPSHOT)
    expect(disposedReport).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
