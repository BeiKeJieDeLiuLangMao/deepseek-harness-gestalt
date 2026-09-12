import { describe, expect, it, vi } from 'vitest'
import { SettingsChrome } from '../src/client/settings-chrome.ts'

type State = { kind: 'settings'; requestId: string; sectionId?: string } | { kind: 'menu' } | null
type Result = { type: 'close' | 'select'; requestId: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function bench(overlay = true, initial: State = null) {
  const stateListeners = new Set<(state: State) => void>()
  const resultListeners = new Set<(result: Result) => void>()
  const report = vi.fn()
  const bridge = {
    chromeOverlayShow: vi.fn(async (_request: Exclude<State, { kind: 'menu' } | null>) => {}),
    chromeOverlayGetState: vi.fn(async (): Promise<State> => initial),
    chromeOverlayResult: vi.fn((_result: Result) => {}),
    onChromeOverlayState: (listener: (state: State) => void) => {
      stateListeners.add(listener)
      return () => { stateListeners.delete(listener) }
    },
    onChromeOverlayResult: (listener: (result: Result) => void) => {
      resultListeners.add(listener)
      return () => { resultListeners.delete(listener) }
    },
  }
  const chrome = new SettingsChrome(bridge, overlay, report)
  return {
    chrome, bridge, report, stateListeners, resultListeners,
    state: (state: State) => { for (const listener of stateListeners) listener(state) },
    result: (result: Result) => { for (const listener of resultListeners) listener(result) },
  }
}

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('Settings chrome preload lifecycle', () => {
  it('keeps browser-only Settings local and exposes no native request', async () => {
    const report = vi.fn()
    const chrome = new SettingsChrome(undefined, false, report)
    expect(chrome.mode).toBe('web')
    chrome.start()
    chrome.open()
    chrome.close('none')
    expect(chrome.state.getSnapshot()).toBeNull()
    await chrome.dispose()
    expect(report).not.toHaveBeenCalled()
  })

  it('rejects an overlay without preload and an incomplete Desktop preload', () => {
    for (const value of [undefined, null, false]) {
      expect(() => new SettingsChrome(value, true, vi.fn())).toThrow('requires the Desktop chrome preload')
    }
    for (const method of [
      'chromeOverlayShow', 'chromeOverlayGetState', 'chromeOverlayResult',
      'onChromeOverlayState', 'onChromeOverlayResult',
    ]) {
      const b = bench()
      const incomplete = { ...b.bridge, [method]: undefined }
      expect(() => new SettingsChrome(incomplete, false, vi.fn())).toThrow(`missing ${method}`)
    }
  })

  it('projects the initial request, keeps equal snapshots stable, and clears on menu or hide', async () => {
    const b = bench(true, { kind: 'settings', requestId: 'initial', sectionId: 'models' })
    b.chrome.start()
    await flush()
    expect(b.chrome.mode).toBe('overlay')
    const request = b.chrome.state.getSnapshot()
    expect(request).toEqual({ requestId: 'initial', sectionId: 'models' })
    b.state({ kind: 'settings', requestId: 'initial', sectionId: 'models' })
    expect(b.chrome.state.getSnapshot()).toBe(request)
    b.state({ kind: 'menu' })
    expect(b.chrome.state.getSnapshot()).toBeNull()
    b.state({ kind: 'settings', requestId: 'next' })
    expect(b.chrome.state.getSnapshot()).toEqual({ requestId: 'next' })
    b.state(null)
    expect(b.chrome.state.getSnapshot()).toBeNull()
    await b.chrome.dispose()
  })

  it('starts hidden when the Host has no Settings request', async () => {
    const b = bench(true, { kind: 'menu' })
    b.chrome.start()
    await flush()
    expect(b.chrome.state.getSnapshot()).toBeNull()
    await b.chrome.dispose()
  })

  it('does not let the initial read overwrite a newer request event', async () => {
    const b = bench()
    const read = deferred<State>()
    b.bridge.chromeOverlayGetState.mockReturnValueOnce(read.promise)
    b.chrome.start()
    b.state({ kind: 'settings', requestId: 'new' })
    read.resolve({ kind: 'settings', requestId: 'stale' })
    await flush()
    expect(b.chrome.state.getSnapshot()).toEqual({ requestId: 'new' })
    await b.chrome.dispose()
  })

  it('sends ordinary Desktop requests and accepts only their matching close result', async () => {
    const b = bench(false)
    b.chrome.start()
    b.chrome.open('models')
    const request = b.chrome.state.getSnapshot()!
    expect(b.chrome.mode).toBe('desktop-host')
    expect(b.bridge.chromeOverlayShow).toHaveBeenCalledWith({ kind: 'settings', ...request })
    expect(request.sectionId).toBe('models')
    b.result({ type: 'close', requestId: 'unrelated' })
    b.result({ type: 'select', requestId: request.requestId })
    b.chrome.close(request.requestId)
    expect(b.chrome.state.getSnapshot()).toBe(request)
    expect(b.bridge.chromeOverlayResult).not.toHaveBeenCalled()
    b.result({ type: 'close', requestId: request.requestId })
    expect(b.chrome.state.getSnapshot()).toBeNull()
    await b.chrome.dispose()
  })

  it('preserves the overlay request for section changes and sends one current close', async () => {
    const b = bench()
    b.chrome.start()
    b.chrome.open('models')
    expect(b.bridge.chromeOverlayShow).not.toHaveBeenCalled()
    b.state({ kind: 'settings', requestId: 'first' })
    b.chrome.open('models')
    expect(b.bridge.chromeOverlayShow).toHaveBeenCalledWith({ kind: 'settings', requestId: 'first', sectionId: 'models' })
    b.state({ kind: 'settings', requestId: 'second' })
    b.chrome.close('first')
    expect(b.bridge.chromeOverlayResult).not.toHaveBeenCalled()
    b.chrome.close('second')
    b.chrome.close('second')
    expect(b.bridge.chromeOverlayResult).toHaveBeenCalledExactlyOnceWith({ type: 'close', requestId: 'second' })
    b.state(null)
    b.chrome.close('second')
    await b.chrome.dispose()
  })

  it('reports read failure and rolls back a failed matching show', async () => {
    const b = bench(false)
    const failedRead = new Error('read failed')
    b.bridge.chromeOverlayGetState.mockRejectedValueOnce(failedRead)
    b.chrome.start()
    await flush()
    expect(b.report).toHaveBeenCalledWith(failedRead)
    const failedShow = new Error('show failed')
    b.bridge.chromeOverlayShow.mockRejectedValueOnce(failedShow)
    b.chrome.open()
    await flush()
    expect(b.chrome.state.getSnapshot()).toBeNull()
    expect(b.report).toHaveBeenCalledWith(failedShow)
    await b.chrome.dispose()
  })

  it('does not clear a newer request when an earlier show fails', async () => {
    const b = bench(false)
    const first = deferred<undefined>()
    b.bridge.chromeOverlayShow.mockReturnValueOnce(first.promise)
    b.chrome.start()
    b.chrome.open('models')
    b.chrome.open('plugins')
    const current = b.chrome.state.getSnapshot()
    first.reject(new Error('old show failed'))
    await flush()
    expect(b.chrome.state.getSnapshot()).toBe(current)
    await b.chrome.dispose()
  })

  it('retains the newer section when an older same-request show rejects', async () => {
    const b = bench()
    const first = deferred<undefined>()
    const failure = new Error('old section show failed')
    b.bridge.chromeOverlayShow.mockReturnValueOnce(first.promise)
    b.chrome.start()
    b.state({ kind: 'settings', requestId: 'overlay' })
    b.chrome.open('models')
    b.chrome.open('plugins')
    await flush()
    const current = b.chrome.state.getSnapshot()
    expect(current).toEqual({ requestId: 'overlay', sectionId: 'plugins' })
    first.reject(failure)
    await flush()
    expect(b.chrome.state.getSnapshot()).toBe(current)
    expect(b.report).toHaveBeenCalledWith(failure)
    await b.chrome.dispose()
  })

  it('retains a newer Host section event when an earlier same-request show rejects', async () => {
    const b = bench()
    const show = deferred<undefined>()
    b.bridge.chromeOverlayShow.mockReturnValueOnce(show.promise)
    b.chrome.start()
    b.state({ kind: 'settings', requestId: 'overlay' })
    b.chrome.open('models')
    b.state({ kind: 'settings', requestId: 'overlay', sectionId: 'plugins' })
    const current = b.chrome.state.getSnapshot()
    show.reject(new Error('old section show failed'))
    await flush()
    expect(b.chrome.state.getSnapshot()).toBe(current)
    expect(b.report).toHaveBeenCalledOnce()
    await b.chrome.dispose()
  })

  it('releases listeners immediately and drains pending reads without late publication', async () => {
    const b = bench()
    const read = deferred<State>()
    b.bridge.chromeOverlayGetState.mockReturnValueOnce(read.promise)
    b.chrome.start()
    const stateListener = [...b.stateListeners][0]!
    const resultListener = [...b.resultListeners][0]!
    let disposed = false
    const disposal = b.chrome.dispose()
    expect(b.chrome.dispose()).toBe(disposal)
    void disposal.then(() => { disposed = true })
    await flush()
    expect(disposed).toBe(false)
    expect(b.stateListeners.size + b.resultListeners.size).toBe(0)
    stateListener({ kind: 'settings', requestId: 'late-event' })
    resultListener({ type: 'close', requestId: 'late-event' })
    b.chrome.start()
    b.chrome.open()
    b.chrome.close('late-event')
    read.resolve({ kind: 'settings', requestId: 'late-read' })
    await disposal
    expect(b.chrome.state.getSnapshot()).toBeNull()
    expect(b.bridge.chromeOverlayShow).not.toHaveBeenCalled()
    expect(b.bridge.chromeOverlayResult).not.toHaveBeenCalled()
  })

  it('drains a pending show and ignores its rejection after disposal', async () => {
    const b = bench(false)
    const show = deferred<undefined>()
    b.bridge.chromeOverlayShow.mockReturnValueOnce(show.promise)
    b.chrome.start()
    b.chrome.open()
    const request = b.chrome.state.getSnapshot()
    const disposal = b.chrome.dispose()
    show.reject(new Error('disposed show'))
    await disposal
    expect(b.chrome.state.getSnapshot()).toBe(request)
    expect(b.report).not.toHaveBeenCalled()
  })
})
