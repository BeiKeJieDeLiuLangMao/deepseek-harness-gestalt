import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LiveMobilePresentationClock,
  fixedMobilePresentationClock,
} from '../src/mobile-clock.ts'

afterEach(() => { vi.useRealTimers() })

describe('Mobile presentation clock', () => {
  it('publishes minute-boundary samples only while observed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const clock = new LiveMobilePresentationClock()
    vi.setSystemTime(1_234)
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = clock.subscribe(first)
    const disposeSecond = clock.subscribe(second)

    expect(clock.getSnapshot()).toBe(1_234)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(60_000 - 1_234)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(clock.getSnapshot()).toBe(60_000)
    expect(vi.getTimerCount()).toBe(1)

    disposeFirst()
    expect(vi.getTimerCount()).toBe(1)
    disposeSecond()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('provides a deterministic fixed clock and rejects non-finite instants', () => {
    const clock = fixedMobilePresentationClock(42)
    const listener = vi.fn()
    expect(clock.getSnapshot()).toBe(42)
    clock.subscribe(listener)()
    expect(listener).not.toHaveBeenCalled()
    expect(() => fixedMobilePresentationClock(Number.NaN)).toThrow('finite epoch millisecond')
  })

  it('does not schedule another tick when the final observer leaves during publication', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const clock = new LiveMobilePresentationClock()
    let dispose = (): void => {}
    dispose = clock.subscribe(() => { dispose() })

    vi.advanceTimersByTime(60_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
