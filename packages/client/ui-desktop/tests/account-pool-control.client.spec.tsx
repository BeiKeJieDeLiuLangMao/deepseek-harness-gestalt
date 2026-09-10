// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccountPoolLoginKind, DesktopAccountPoolAccount, DesktopAccountPoolSnapshot, DesktopBridge } from '../src/protocol.ts'
import { AccountPoolControl } from '../src/client/account-pool/AccountPoolControl.tsx'
import { en } from '../src/client/locales.ts'
import { INITIAL_ACCOUNT_POOL_SNAPSHOT } from '../src/client/account-pool-source.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete window.dshDesktop
})

const t = (key: string) => (en as Record<string, string>)[key] ?? key

const account: DesktopAccountPoolAccount = {
  authIndex: 'kimi-1',
  name: 'kimi-user.json',
  provider: 'kimi',
  label: 'Kimi',
  email: 'user@example.test',
  status: 'active',
  enabled: true,
  successCount: 3,
  failCount: 1,
  quota: [{ key: '5h', label: '5h', remainingPercent: 40, timeRemainingPercent: 70, status: 'known' }],
}

describe('AccountPoolControl', () => {
  it('switches every card with a global face command and still allows a local flip', () => {
    window.dshDesktop = bridge()
    renderControl({ state: 'ready', accounts: [account] })
    expect(screen.getByTestId('account-card-kimi-1').getAttribute('data-current-face')).toBe('A')
    fireEvent.click(screen.getByTestId('global-face-btn-b'))
    expect(screen.getByTestId('account-card-kimi-1').getAttribute('data-current-face')).toBe('B')
    fireEvent.click(screen.getByTestId('card-flip-btn-kimi-1'))
    expect(screen.getByTestId('account-card-kimi-1').getAttribute('data-current-face')).toBe('A')
    fireEvent.click(screen.getByTestId('global-face-btn-a'))
    expect(screen.getByTestId('account-card-kimi-1').getAttribute('data-current-face')).toBe('A')
  })

  it('keeps secrets out of the snapshot JSON', () => {
    expect(JSON.stringify(INITIAL_ACCOUNT_POOL_SNAPSHOT)).not.toMatch(/api-key|secret|Bearer/i)
    expect(JSON.stringify({ state: 'ready', accounts: [account] })).not.toMatch(/api-key|secret|Bearer/i)
  })
})

function renderControl(snapshot: DesktopAccountPoolSnapshot): ReturnType<typeof render> {
  return render(
    <AccountPoolControl
      t={t as never}
      useAccountPool={select => select(snapshot)}
      useSessions={() => { throw new Error('unused') }}
      useWorkspaces={() => { throw new Error('unused') }}
      close={vi.fn()}
    />,
  )
}

const ready: DesktopAccountPoolSnapshot = { state: 'ready', accounts: [account] }

function bridge(): DesktopBridge {
  return {
    platform: 'darwin',
    getStatus: vi.fn(),
    checkNow: vi.fn(),
    downloadNow: vi.fn(),
    quitAndInstall: vi.fn(),
    onStatus: () => () => {},
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    accountGetSnapshot: vi.fn(),
    accountAcceptPrivacy: vi.fn(),
    accountBeginLogin: vi.fn(),
    accountCancelLogin: vi.fn(),
    accountSignOut: vi.fn(),
    onAccountSnapshot: () => () => {},
    pairingGetSnapshot: vi.fn(),
    pairingSetEnabled: vi.fn(),
    pairingCreateChallenge: vi.fn(),
    pairingCancelChallenge: vi.fn(),
    pairingConfirm: vi.fn(),
    pairingReject: vi.fn(),
    pairingRevoke: vi.fn(),
    onPairingSnapshot: () => () => {},
    accountPoolGetSnapshot: vi.fn(async () => ready),
    accountPoolRefresh: vi.fn(async () => ready),
    accountPoolSetEnabled: vi.fn(async () => ready),
    accountPoolDelete: vi.fn(async () => ({ state: 'ready' as const, accounts: [] })),
    accountPoolStartLogin: vi.fn(async (kind: AccountPoolLoginKind) => ({
      kind, flow: kind === 'glm' ? 'glm-key' as const : kind === 'kimi' || kind === 'xai' ? 'device' as const : 'pkce' as const,
    })),
    accountPoolLoginStatus: vi.fn(async () => ready),
    accountPoolCancelLogin: vi.fn(async () => ready),
    accountPoolSubmitGlmKey: vi.fn(async () => ready),
    accountPoolRefreshQuota: vi.fn(async () => ready),
    onAccountPoolSnapshot: () => () => {},
    chromeOverlayShow: async () => {},
    chromeOverlayHide: async () => {},
    chromeOverlayGetState: async () => null,
    chromeOverlayResult: () => {},
    onChromeOverlayState: () => () => {},
    onChromeOverlayResult: () => () => {},
  }
}
