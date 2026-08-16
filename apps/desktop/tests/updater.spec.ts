import { describe, expect, it, vi } from 'vitest'
import {
  autoUpdaterFromModule, startAutoUpdater, type AutoUpdaterPort,
} from '../src/updater.ts'

function fakeUpdater(): AutoUpdaterPort & { emit: (event: string, info?: unknown) => void } {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(() => Promise.resolve()),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return this
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
      return this
    },
    emit(event, info) {
      for (const listener of listeners.get(event) ?? []) listener(info)
    },
  }
}

describe('startAutoUpdater', () => {
  it('accepts the CommonJS default export exposed by Node ESM import', () => {
    const updater = fakeUpdater()
    expect(autoUpdaterFromModule({ default: { autoUpdater: updater } })).toBe(updater)
  })

  it('does not auto-download and waits for download() after available', () => {
    const updater = fakeUpdater()
    const seen: string[] = []
    const life = startAutoUpdater({
      updater,
      onStateChange: (status) => { seen.push(status.state) },
      now: () => 10,
    })
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    life.checkForUpdates()
    updater.emit('update-available', { version: '0.1.1' })
    expect(life.state()).toMatchObject({ state: 'available', newVersion: '0.1.1' })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    life.download()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    updater.emit('update-downloaded', { version: '0.1.1' })
    life.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    life.dispose()
    expect(seen).toContain('available')
  })

  it('preserves a discovered version only for later failures', () => {
    const updater = fakeUpdater()
    const life = startAutoUpdater({ updater, now: () => 10 })

    updater.emit('error', new Error('offline'))
    expect(life.state()).toEqual({ state: 'error', lastCheckedAt: null, errorMessage: 'offline' })

    updater.emit('update-available', { version: '0.1.1' })
    updater.emit('error', new Error('download failed'))
    expect(life.state()).toEqual({
      state: 'error',
      lastCheckedAt: 10,
      newVersion: '0.1.1',
      errorMessage: 'download failed',
    })
    life.dispose()
  })

  it('preserves a discovered version when a repeated check rejects', async () => {
    let rejectCheck: ((error: Error) => void) | undefined
    const updater = {
      ...fakeUpdater(),
      checkForUpdates: vi.fn(() => new Promise((_resolve, reject) => { rejectCheck = reject })),
    }
    const life = startAutoUpdater({ updater, now: () => 10 })

    updater.emit('update-available', { version: '0.1.1' })
    updater.emit('error', new Error('event failure'))
    life.checkForUpdates()
    rejectCheck?.(new Error('retry failed'))
    await Promise.resolve()
    await Promise.resolve()

    expect(life.state()).toEqual({
      state: 'error',
      lastCheckedAt: 10,
      newVersion: '0.1.1',
      errorMessage: 'retry failed',
    })
    life.dispose()
  })

  it('contains a renderer notification failure and still starts the check', () => {
    const updater = fakeUpdater()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const life = startAutoUpdater({
      updater,
      onStateChange: () => { throw new Error('renderer gone') },
    })

    expect(() => { life.checkForUpdates() }).not.toThrow()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalled()
    life.dispose()
    report.mockRestore()
  })

  it('ignores a late check failure after disposal', async () => {
    let rejectCheck: ((error: Error) => void) | undefined
    const updater = {
      ...fakeUpdater(),
      checkForUpdates: vi.fn(() => new Promise((_resolve, reject) => { rejectCheck = reject })),
    }
    const seen = vi.fn()
    const life = startAutoUpdater({ updater, onStateChange: seen })
    life.checkForUpdates()
    expect(seen).toHaveBeenCalledOnce()

    life.dispose()
    rejectCheck?.(new Error('late failure'))
    await Promise.resolve()
    await Promise.resolve()

    expect(seen).toHaveBeenCalledOnce()
    expect(life.state().state).toBe('checking')
  })
})
