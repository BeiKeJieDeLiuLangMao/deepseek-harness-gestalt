// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DesktopAccountSnapshot, DesktopBridge } from '../src/protocol.ts'
import { AccountControl } from '../src/client/AccountControl.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.dshDesktop
})

const t = (key: string) => (en as Record<string, string>)[key] ?? key

describe('AccountControl', () => {
  it('shows both privacy notices and blocks authorization until consent', () => {
    const snapshot: DesktopAccountSnapshot = { status: 'idle', privacyAccepted: false }
    const desktop = bridge(snapshot)
    window.dshDesktop = desktop
    renderControl(snapshot)

    expect(screen.getByText(/Platform 会保存 GitHub 数字 ID/)).toBeTruthy()
    expect(screen.getByText(/Platform stores the numeric GitHub id/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to GitHub' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(desktop.accountAcceptPrivacy).toHaveBeenCalledOnce()
    expect(desktop.accountBeginLogin).not.toHaveBeenCalled()
  })

  it('starts authorization after consent and signs out only the shown installation', () => {
    const accepted: DesktopAccountSnapshot = { status: 'idle', privacyAccepted: true }
    const desktop = bridge(accepted)
    window.dshDesktop = desktop
    renderControl(accepted)
    fireEvent.click(screen.getByRole('button', { name: 'Continue to GitHub' }))
    expect(desktop.accountBeginLogin).toHaveBeenCalledOnce()

    cleanup()
    const signedIn: DesktopAccountSnapshot = {
      status: 'signed-in',
      privacyAccepted: true,
      account: {
        id: 'account-1',
        githubId: 13994321,
        githubLogin: 'octocat',
        avatarUrl: 'https://avatars.example/octocat',
      },
    }
    renderControl(signedIn)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out this installation' }))
    expect(desktop.accountSignOut).toHaveBeenCalledOnce()
    expect(screen.getByText(/preserves Personal Pairings/)).toBeTruthy()
  })
})

function renderControl(snapshot: DesktopAccountSnapshot): void {
  render(
    <AccountControl
      t={t as never}
      useSessions={(() => { throw new Error('unused') })}
      useWorkspaces={(() => { throw new Error('unused') })}
      useAccount={selector => selector(snapshot)}
      close={vi.fn()}
    />,
  )
}

function bridge(snapshot: DesktopAccountSnapshot): DesktopBridge {
  return {
    platform: 'darwin',
    getStatus: async () => ({ state: 'idle', lastCheckedAt: null }),
    checkNow: vi.fn(),
    downloadNow: vi.fn(),
    quitAndInstall: vi.fn(),
    onStatus: () => () => {},
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    accountGetSnapshot: vi.fn().mockResolvedValue(snapshot),
    accountAcceptPrivacy: vi.fn().mockResolvedValue({ ...snapshot, privacyAccepted: true }),
    accountBeginLogin: vi.fn().mockResolvedValue({ status: 'polling', privacyAccepted: true }),
    accountSignOut: vi.fn().mockResolvedValue({ status: 'idle', privacyAccepted: true }),
    onAccountSnapshot: () => () => {},
  }
}
