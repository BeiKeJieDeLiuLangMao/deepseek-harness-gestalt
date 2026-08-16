// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DesktopBridge } from '../src/protocol.ts'
import { DragStrip } from '../src/client/DragStrip.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.dshDesktop
})

const t = (key: string) => (en as Record<string, string>)[key] ?? key

function bridge(platform: NodeJS.Platform): DesktopBridge {
  return {
    platform,
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
}

describe('DragStrip', () => {
  it('paints no caption buttons on macOS', () => {
    window.dshDesktop = bridge('darwin')
    render(
      <DragStrip
        wide
        t={t as never}
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('[data-desktop-chrome="mac"]')).not.toBeNull()
  })

  it('paints Windows caption buttons', () => {
    const desktop = bridge('win32')
    window.dshDesktop = desktop
    render(
      <DragStrip
        wide
        t={t as never}
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(desktop.windowMinimize).toHaveBeenCalledOnce()
    expect(desktop.windowMaximize).toHaveBeenCalledOnce()
    expect(desktop.windowClose).toHaveBeenCalledOnce()
  })
})
