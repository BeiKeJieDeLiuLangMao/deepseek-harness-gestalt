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
})
