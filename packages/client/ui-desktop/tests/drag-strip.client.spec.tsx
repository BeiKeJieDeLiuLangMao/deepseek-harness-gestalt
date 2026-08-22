// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    accountGetSnapshot: vi.fn().mockResolvedValue({ status: 'unavailable', privacyAccepted: false }),
    accountAcceptPrivacy: vi.fn(),
    accountBeginLogin: vi.fn(),
    accountSignOut: vi.fn(),
    onAccountSnapshot: () => () => {},
    pairingGetSnapshot: vi.fn(), pairingSetEnabled: vi.fn(), pairingCreateChallenge: vi.fn(),
    pairingCancelChallenge: vi.fn(), pairingConfirm: vi.fn(), pairingReject: vi.fn(), pairingRevoke: vi.fn(),
    onPairingSnapshot: () => () => {},
    chromeOverlayShow: async () => {},
    chromeOverlayHide: async () => {},
    chromeOverlayGetState: async () => null,
    chromeOverlayResult: () => {},
    onChromeOverlayState: () => () => {},
    onChromeOverlayResult: () => () => {},
  }
}

describe('DragStrip', () => {
  it('keeps a draggable macOS row above the unchanged sidebar header', () => {
    const css = readFileSync(join(process.cwd(), 'packages/client/ui-desktop/src/client/DragStrip.module.css'), 'utf8')
    const rule = /\.macChrome\s*\{(?<body>[^}]+)\}/.exec(css)?.groups?.body ?? ''
    expect(rule).toContain('position: fixed')
    expect(rule).toContain('height: 28px')
    expect(rule).toContain('-webkit-app-region: drag')
  })

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

  it('adds no custom chrome on unsupported system-frame platforms', () => {
    window.dshDesktop = bridge('linux')
    const { container } = render(
      <DragStrip
        wide
        t={t as never}
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
      />,
    )
    expect(container.innerHTML).toBe('')
  })
})
