// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DesktopBridge, UpdaterStatus } from '../src/protocol.ts'
import { applyUpdaterClick, UpdateControl } from '../src/client/UpdateControl.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.dshDesktop
})

const t = (key: string) => (en as Record<string, string>)[key] ?? key

function mount(status: UpdaterStatus, bridge?: Partial<DesktopBridge>) {
  const desktop: DesktopBridge = {
    platform: 'darwin',
    getStatus: () => Promise.resolve(status),
    checkNow: vi.fn(),
    downloadNow: vi.fn(),
    quitAndInstall: vi.fn(),
    onStatus: () => () => {},
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    getFullscreen: () => Promise.resolve(false),
    onFullscreen: () => () => {},
    ...bridge,
  }
  window.dshDesktop = desktop
  render(
    <UpdateControl
      wide
      t={t as never}
      useSessions={(() => { throw new Error('unused') })}
      useWorkspaces={(() => { throw new Error('unused') })}
      useUpdater={select => select(status)}
    />,
  )
  return desktop
}

describe('UpdateControl', () => {
  it('renders nothing without the Desktop bridge', () => {
    render(
      <UpdateControl
        wide
        t={t as never}
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
        useUpdater={select => select({ state: 'idle', lastCheckedAt: null })}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('checks when idle and downloads when a version is available', () => {
    const idle = mount({ state: 'idle', lastCheckedAt: null })
    fireEvent.click(screen.getByRole('button', { name: 'Up to date' }))
    expect(idle.checkNow).toHaveBeenCalledOnce()
    cleanup()
    const available = mount({ state: 'available', lastCheckedAt: 1, newVersion: '0.1.1' })
    fireEvent.click(screen.getByRole('button', { name: 'Download 0.1.1' }))
    expect(available.downloadNow).toHaveBeenCalledOnce()
  })

  it('installs after download and stays disabled while checking', () => {
    const downloaded = mount({ state: 'downloaded', lastCheckedAt: 1, newVersion: '0.1.1' })
    fireEvent.click(screen.getByRole('button', { name: 'Install and restart' }))
    expect(downloaded.quitAndInstall).toHaveBeenCalledOnce()
    cleanup()
    mount({ state: 'checking', lastCheckedAt: null })
    expect(screen.getByRole('button', { name: 'Checking for updates' }).hasAttribute('disabled')).toBe(true)
  })

  it('surfaces error, disabled, and download progress copy', () => {
    const errored = mount({ state: 'error', lastCheckedAt: 1, errorMessage: 'offline' })
    fireEvent.click(screen.getByRole('button', { name: 'offline' }))
    expect(errored.checkNow).toHaveBeenCalledOnce()
    cleanup()
    const disabled = mount({ state: 'disabled', lastCheckedAt: null })
    fireEvent.click(screen.getByRole('button', { name: 'Updates disabled in development' }))
    expect(disabled.checkNow).toHaveBeenCalledOnce()
    cleanup()
    cleanup()
    mount({ state: 'available', lastCheckedAt: 1 })
    expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy()
    cleanup()
    mount({ state: 'error', lastCheckedAt: 1 })
    expect(screen.getByRole('button', { name: 'Update failed' })).toBeTruthy()
    cleanup()
    mount({ state: 'downloading', lastCheckedAt: 1 })
    expect(screen.getByRole('button', { name: 'Downloading 0%' }).hasAttribute('disabled')).toBe(true)
    cleanup()
    mount({ state: 'downloading', lastCheckedAt: 1, downloadPercent: 40 })
    expect(screen.getByRole('button', { name: 'Downloading 40%' }).hasAttribute('disabled')).toBe(true)
    cleanup()
    mount({ state: 'installing', lastCheckedAt: 1, newVersion: '0.1.1' })
    expect(screen.getByRole('button', { name: 'Install and restart' }).hasAttribute('disabled')).toBe(true)
    cleanup()
    window.dshDesktop = {
      platform: 'darwin',
      getStatus: () => Promise.resolve({ state: 'idle', lastCheckedAt: null }),
      checkNow: vi.fn(),
      downloadNow: vi.fn(),
      quitAndInstall: vi.fn(),
      onStatus: () => () => {},
      windowMinimize: vi.fn(),
      windowMaximize: vi.fn(),
      windowClose: vi.fn(),
      getFullscreen: () => Promise.resolve(false),
      onFullscreen: () => () => {},
    }
    render(
      <UpdateControl
        wide={false}
        t={t as never}
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
        useUpdater={select => select({ state: 'idle', lastCheckedAt: null })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Up to date' })).toBeTruthy()
  })

  it('no-ops while a check or download is already running', () => {
    const desktop = mount({ state: 'idle', lastCheckedAt: null })
    applyUpdaterClick('checking', desktop)
    applyUpdaterClick('downloading', desktop)
    applyUpdaterClick('installing', desktop)
    expect(desktop.checkNow).not.toHaveBeenCalled()
    expect(desktop.downloadNow).not.toHaveBeenCalled()
    expect(desktop.quitAndInstall).not.toHaveBeenCalled()
  })
})
