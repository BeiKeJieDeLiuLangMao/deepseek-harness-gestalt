// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccountPoolLoginKind, DesktopAccountPoolAccount, DesktopAccountPoolSnapshot, DesktopBridge } from '../src/protocol.ts'
import { AccountPoolControl } from '../src/client/account-pool/AccountPoolControl.tsx'
import { AccountCard } from '../src/client/account-pool/AccountCard.tsx'
import { LoginModal } from '../src/client/account-pool/LoginModal.tsx'
import { QuotaBarWithTimeline } from '../src/client/account-pool/QuotaBarWithTimeline.tsx'
import { en } from '../src/client/locales.ts'
import {
  bindDesktopAccountPool,
  createDesktopAccountPoolSource,
  INITIAL_ACCOUNT_POOL_SNAPSHOT,
} from '../src/client/account-pool-source.ts'

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

  it('renders nothing without a Desktop bridge', () => {
    delete window.dshDesktop
    const { container } = renderControl({ state: 'starting', accounts: [] })
    expect(container.querySelector('[data-desktop-account-pool-state]')).toBeNull()
  })

  it('filters cards, opens GLM login, and submits optional org fields', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [account] })
    fireEvent.click(screen.getByText('codex (0)'))
    expect(screen.queryByTestId('account-card-kimi-1')).toBeNull()
    fireEvent.click(screen.getByText(/全部/))
    expect(screen.getByTestId('account-card-kimi-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号 ▾' }))
    fireEvent.click(screen.getByRole('button', { name: 'GLM' }))
    fireEvent.change(screen.getByDisplayValue('open.bigmodel.cn'), { target: { value: 'international' } })
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'glm-key' } })
    fireEvent.change(inputs[0]!, { target: { value: 'org-1' } })
    fireEvent.change(inputs[1]!, { target: { value: 'proj-1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并接入账号池' }))
    expect(desktop.accountPoolSubmitGlmKey).toHaveBeenCalledWith({
      apiKey: 'glm-key',
      site: 'international',
      organization: 'org-1',
      project: 'proj-1',
    })
  })

  it('starts a PKCE login from the add menu', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号 ▾' }))
    fireEvent.click(screen.getByRole('button', { name: 'CODEX' }))
    expect(desktop.accountPoolStartLogin).toHaveBeenCalledWith('codex')
  })
})

describe('AccountCard', () => {
  it('toggles, deletes, and refreshes empty quota on face B', () => {
    const onToggleStatus = vi.fn()
    const onRefreshQuota = vi.fn()
    const onDelete = vi.fn()
    render(
      <AccountCard
        item={{
          authIndex: account.authIndex,
          name: account.name,
          provider: account.provider,
          label: account.label,
          status: account.status,
          enabled: false,
          successCount: account.successCount,
          failCount: account.failCount,
          statusMessage: 'paused',
          quota: [],
          createdAt: 'yesterday',
        }}
        globalFace="A"
        globalEpoch={0}
        onToggleStatus={onToggleStatus}
        onRefreshQuota={onRefreshQuota}
        onDelete={onDelete}
      />,
    )
    expect(screen.getByText('停用')).toBeTruthy()
    expect(screen.getByText('paused')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith('kimi-user.json')
    fireEvent.click(screen.getByRole('button', { name: '查看配额' }))
    fireEvent.click(screen.getByRole('button', { name: '立即探测刷新' }))
    expect(onRefreshQuota).toHaveBeenCalledWith('kimi-1')
    fireEvent.click(screen.getByRole('button', { name: '返回管理' }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleStatus).toHaveBeenCalledWith('kimi-user.json', true)
  })

  it('draws quota bars and provider glyphs', () => {
    for (const provider of ['codex', 'anthropic', 'antigravity', 'xai', 'glm'] as const) {
      const { unmount } = render(
        <AccountCard
          item={{ ...account, authIndex: `${provider}-1`, provider, quota: [] }}
          globalFace="A"
          globalEpoch={0}
          onToggleStatus={vi.fn()}
          onRefreshQuota={vi.fn()}
          onDelete={vi.fn()}
        />,
      )
      unmount()
    }
    render(
      <AccountCard
        item={{
          ...account,
          provider: 'unknown',
          quota: [
            { key: 'empty', label: 'empty', status: 'unsupported' },
            { key: 'zero', label: 'zero', remainingPercent: 0, timeRemainingPercent: 0, status: 'known' },
            { key: 'low', label: 'low', remainingPercent: 10, timeRemainingPercent: 20, status: 'known' },
            { key: 'mid', label: 'mid', remainingPercent: 50, timeRemainingPercent: 60, status: 'known' },
            { key: 'high', label: 'high', remainingPercent: 90, timeRemainingPercent: 80, status: 'known' },
          ],
        }}
        globalFace="B"
        globalEpoch={1}
        onToggleStatus={vi.fn()}
        onRefreshQuota={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('●')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新额度' }))
  })
})

describe('LoginModal', () => {
  it('cancels an authorizing device login', () => {
    const onCancel = vi.fn()
    render(
      <LoginModal
        initialProvider="kimi"
        login={{ kind: 'kimi', flow: 'device', state: 's1', url: 'https://example.test/device', userCode: 'ABCD' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={onCancel}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledWith('s1')
  })

  it('starts PKCE from the select step and shows a failed result', () => {
    const onStart = vi.fn()
    const { rerender } = render(
      <LoginModal
        initialProvider="anthropic"
        onClose={vi.fn()}
        onStart={onStart}
        onCancel={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /开始 ANTHROPIC 登录/ }))
    expect(onStart).toHaveBeenCalledWith('anthropic')
    rerender(
      <LoginModal
        initialProvider="anthropic"
        login={{ kind: 'anthropic', flow: 'pkce', error: 'denied' }}
        onClose={vi.fn()}
        onStart={onStart}
        onCancel={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    expect(screen.getByText('denied')).toBeTruthy()
  })
})

describe('QuotaBarWithTimeline', () => {
  it('hides fill when the window is unreliable', () => {
    render(
      <QuotaBarWithTimeline
        name="5h"
        windowLabel="5h"
        resetText="未知"
        isReliable={false}
        percentRemaining={40}
        timeRemainingPercent={70}
      />,
    )
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0)
  })
})

describe('account-pool source', () => {
  it('uses the default listener and bind error reporters', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = createDesktopAccountPoolSource()
    source.subscribe(() => { throw new Error('listener') })
    source.set({ state: 'ready', accounts: [] })
    expect(error).toHaveBeenCalled()
    bindDesktopAccountPool(source, {
      accountPoolGetSnapshot: async () => { throw new Error('read failed') },
      onAccountPoolSnapshot: () => () => {},
    })
    await vi.waitFor(() => {
      expect(error.mock.calls.some(call => String(call[0]).includes('failed to read account-pool state'))).toBe(true)
    })
    error.mockRestore()
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
