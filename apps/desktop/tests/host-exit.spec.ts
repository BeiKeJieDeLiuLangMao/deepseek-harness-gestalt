import { describe, expect, it } from 'vitest'
import { planHostExit, shouldPreventQuit, startWithOneRetry } from '../src/host-exit.ts'

describe('planHostExit', () => {
  it('ignores an exit after the window is gone, respawns once, then errors', () => {
    expect(planHostExit(false, false)).toBe('ignore')
    expect(planHostExit(true, false)).toBe('respawn')
    expect(planHostExit(true, true)).toBe('error')
  })

  it('retries one startup failure and reports that retry to the supervisor', async () => {
    let attempts = 0
    const result = await startWithOneRetry(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('first start failed')
      return 'host'
    })
    expect(result).toEqual({ value: 'host', retried: true })
    expect(attempts).toBe(2)
  })

  it('surfaces the second startup failure without a third attempt', async () => {
    let attempts = 0
    await expect(startWithOneRetry(async () => {
      attempts += 1
      throw new Error('start failed ' + String(attempts))
    })).rejects.toThrow('start failed 2')
    expect(attempts).toBe(2)
  })

  it('lets quitAndInstall finish instead of intercepting before-quit', () => {
    expect(shouldPreventQuit({ shuttingDown: false, updaterState: 'installing' })).toBe(false)
    expect(shouldPreventQuit({ shuttingDown: false, updaterState: 'downloaded' })).toBe(true)
    expect(shouldPreventQuit({ shuttingDown: true, updaterState: 'installing' })).toBe(false)
  })

  it('does not retry a shutdown cancellation', async () => {
    let attempts = 0
    await expect(startWithOneRetry(async () => {
      attempts += 1
      throw new Error('aborted')
    }, () => {}, () => false)).rejects.toThrow('aborted')
    expect(attempts).toBe(1)
  })
})
