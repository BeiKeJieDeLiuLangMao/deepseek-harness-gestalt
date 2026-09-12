// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccountPoolLoginKind, DesktopAccountPoolAccount, DesktopAccountPoolSnapshot, DesktopBridge } from '../src/protocol.ts'
import { AccountPoolControl } from '../src/client/account-pool/AccountPoolControl.tsx'
import { AccountCard } from '../src/client/account-pool/AccountCard.tsx'
import { LoginModal } from '../src/client/account-pool/LoginModal.tsx'
import { QuotaBarWithTimeline } from '../src/client/account-pool/QuotaBarWithTimeline.tsx'
import { quotaPlanLabel, quotaResetText, quotaWindowTitle, visibleQuotaWindows } from '../src/client/account-pool/quota-display.ts'
import { zh } from '../src/client/locales.ts'
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

const t = (key: string, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

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
  it('keeps the Chinese title beside runtime status and omits the built-in banner', () => {
    window.dshDesktop = bridge()
    renderControl({ state: 'ready', accounts: [account] })
    expect(screen.getByTestId('account-pool-title').textContent).toBe(zh['sub2api.workspaceTitle'])
    expect(screen.getByTestId('account-pool-status').textContent).toContain(zh['sub2api.running'])
    expect(screen.queryByText('DESKTOP BUILT-IN')).toBeNull()
    expect(screen.queryByText('Built-in account pool')).toBeNull()
    expect(screen.queryByText(/gestalt-account-pool/)).toBeNull()
  })

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

  it('filters cards, opens GLM login, and submits a team organization', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [account] })
    fireEvent.click(screen.getByText(/Codex \(/))
    expect(screen.queryByTestId('account-card-kimi-1')).toBeNull()
    fireEvent.click(screen.getByText(/全部 \(/))
    expect(screen.getByTestId('account-card-kimi-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号' }))
    fireEvent.click(screen.getByTestId('provider-card-glm'))
    fireEvent.change(screen.getByLabelText('站点：'), { target: { value: 'international' } })
    fireEvent.click(screen.getByLabelText('团队'))
    fireEvent.change(screen.getByLabelText('订阅专用 API Key：'), { target: { value: 'glm-key' } })
    fireEvent.change(screen.getByLabelText('团队 organization：'), { target: { value: 'org-1' } })
    fireEvent.change(screen.getByLabelText('项目 project（可选）：'), { target: { value: 'proj-1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并接入账号池' }))
    expect(desktop.accountPoolSubmitGlmKey).toHaveBeenCalledWith({
      apiKey: 'glm-key',
      site: 'international',
      organization: 'org-1',
      project: 'proj-1',
    })
  })

  it('starts a PKCE login from the credential modal', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号' }))
    expect(screen.getByText('选择平台认证类型：')).toBeTruthy()
    expect(desktop.accountPoolStartLogin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('provider-card-codex'))
    fireEvent.click(screen.getByRole('button', { name: '开始 CODEX 登录' }))
    expect(desktop.accountPoolStartLogin).toHaveBeenCalledTimes(1)
    expect(desktop.accountPoolStartLogin).toHaveBeenCalledWith('codex')
  })

  it('polls login status, cancels, and forwards card mutations', async () => {
    vi.useFakeTimers()
    const desktop = bridge()
    window.dshDesktop = desktop
    const { unmount } = renderControl({
      state: 'ready',
      accounts: [account],
      login: { kind: 'kimi', flow: 'device', state: 's1', url: 'https://example.test/device' },
    })
    await vi.advanceTimersByTimeAsync(1_500)
    expect(desktop.accountPoolLoginStatus).toHaveBeenCalledWith('s1')
    unmount()
    vi.useRealTimers()
    renderControl({
      state: 'error',
      accounts: [account],
      error: 'kernel failed',
      login: { kind: 'kimi', flow: 'device', state: 's1' },
    })
    expect(screen.getByText('kernel failed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(desktop.accountPoolCancelLogin).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(desktop.accountPoolDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '删除认证文件' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('delete-cancel'))
    expect(desktop.accountPoolDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByTestId('delete-confirm'))
    expect(desktop.accountPoolDelete).toHaveBeenCalledWith('kimi-user.json')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(desktop.accountPoolSetEnabled).toHaveBeenCalledWith('kimi-user.json', false)
    fireEvent.click(screen.getByTestId('card-flip-btn-kimi-1'))
    fireEvent.click(screen.getByRole('button', { name: '刷新额度' }))
    expect(desktop.accountPoolRefreshQuota).toHaveBeenCalledWith('kimi-1')
  })

  it('opens models and settings dialogs from the management-face actions', async () => {
    const desktop = {
      ...bridge(),
      accountPoolListModels: vi.fn(async () => [{ id: 'kimi-k2', name: 'Kimi K2', ownedBy: 'kimi' }]),
    }
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [account] })
    fireEvent.click(screen.getByRole('button', { name: '模型' }))
    expect(await screen.findByRole('dialog', { name: '支持的模型 - kimi-user.json' })).toBeTruthy()
    expect(screen.getByText('Kimi K2')).toBeTruthy()
    fireEvent.click(screen.getByText('kimi-k2'))
    fireEvent.click(screen.getByText('关闭'))
    fireEvent.click(screen.getByRole('button', { name: '刷新全部额度' }))
    expect(desktop.accountPoolRefreshAllQuota).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(desktop.accountPoolRefresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('dialog', { name: '认证文件详情 / 编辑' })).toBeTruthy()
    expect(screen.getByLabelText('前缀 (prefix)')).toBeTruthy()
    expect(screen.getByLabelText('代理 URL (proxy_url)')).toBeTruthy()
    expect(screen.getByLabelText('优先级 (priority)')).toBeTruthy()
    expect(screen.getByLabelText('调度权重 (weight)')).toBeTruthy()
    expect(screen.getByLabelText('排除模型 (excluded_models)')).toBeTruthy()
    expect(screen.getByLabelText('通配符规则')).toBeTruthy()
    expect(screen.getByLabelText('自定义请求头 (headers)')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('排除模型 (excluded_models)'))
    expect(await screen.findByPlaceholderText('搜索模型...')).toBeTruthy()
    fireEvent.click(await screen.findByText('kimi-k2'))
    fireEvent.change(screen.getByLabelText('备注 (note)'), { target: { value: 'team' } })
    fireEvent.change(screen.getByLabelText('通配符规则'), { target: { value: 'gpt-5-*' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(desktop.accountPoolPatchFields).toHaveBeenCalledWith('kimi-user.json', expect.objectContaining({
      note: 'team',
      excludedModels: ['kimi-k2', 'gpt-5-*'],
    }))
  })

  it('shows an empty-models dialog when the Host returns no models', async () => {
    const desktop = {
      ...bridge(),
      accountPoolListModels: vi.fn(async () => []),
    }
    window.dshDesktop = desktop
    renderControl({ state: 'ready', accounts: [account] })
    fireEvent.click(screen.getByRole('button', { name: '模型' }))
    expect(await screen.findByText('该凭证当前没有可列出的模型。')).toBeTruthy()
  })

  it('closes the credential modal after login leaves the snapshot', () => {
    window.dshDesktop = bridge()
    const { rerender } = renderControl({
      state: 'ready',
      accounts: [],
      login: { kind: 'xai', flow: 'device', state: 's1', url: 'https://example.test/device' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号' }))
    expect(screen.getByText(/正在等待 XAI 设备授权/)).toBeTruthy()
    rerender(controlTree({ state: 'ready', accounts: [account] }))
    expect(screen.queryByText('添加账号凭证')).toBeNull()
    expect(screen.queryByText('选择平台认证类型：')).toBeNull()
  })

  it('closes the GLM modal without submitting', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({ state: 'starting', accounts: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ 添加账号' }))
    fireEvent.click(screen.getByTestId('provider-card-glm'))
    fireEvent.click(screen.getByLabelText('关闭'))
    expect(desktop.accountPoolSubmitGlmKey).not.toHaveBeenCalled()
    expect(desktop.accountPoolDismissLogin).toHaveBeenCalled()
  })

  it('dismisses a failed OAuth overlay so Close actually hides it', () => {
    const desktop = bridge()
    window.dshDesktop = desktop
    renderControl({
      state: 'ready',
      accounts: [],
      login: { kind: 'codex', flow: 'pkce', error: 'Timeout waiting for OAuth callback' },
    })
    fireEvent.click(screen.getByText('关闭'))
    expect(desktop.accountPoolDismissLogin).toHaveBeenCalled()
  })
})

describe('AccountCard', () => {
  it('toggles, deletes, and refreshes empty quota on face B', () => {
    const onToggleStatus = vi.fn()
    const onRefreshQuota = vi.fn()
    const onDelete = vi.fn()
    render(
      <AccountCard
        t={t}
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
          sizeBytes: 554,
          recentRequests: [{ success: 1, failed: 0 }, { success: 0, failed: 1 }],
        }}
        globalFace="A"
        globalEpoch={0}
        onToggleStatus={onToggleStatus}
        onRefreshQuota={onRefreshQuota}
        onDelete={onDelete}
        onListModels={vi.fn()}
        onRefresh={vi.fn()}
        onDownload={vi.fn()}
        onEditSettings={vi.fn()}
      />,
    )
    expect(screen.getByText('停用')).toBeTruthy()
    expect(screen.getByText('paused')).toBeTruthy()
    expect(screen.getByText(/554.00 B/)).toBeTruthy()
    expect(screen.getByTestId('health-ticks-kimi-1').children).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith('kimi-user.json')
    fireEvent.click(screen.getByTestId('card-flip-btn-kimi-1'))
    fireEvent.click(screen.getByRole('button', { name: '立即探测刷新' }))
    expect(onRefreshQuota).toHaveBeenCalledWith('kimi-1')
    expect(screen.queryByRole('button', { name: '返回管理' })).toBeNull()
    fireEvent.click(screen.getByTestId('card-flip-btn-kimi-1'))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleStatus).toHaveBeenCalledWith('kimi-user.json', true)
  })

  it('draws quota bars and provider glyphs', () => {
    for (const provider of ['codex', 'anthropic', 'antigravity', 'xai', 'glm'] as const) {
      const { unmount } = render(
        <AccountCard
          t={t}
          item={{ ...account, authIndex: `${provider}-1`, provider, quota: [] }}
          globalFace="A"
          globalEpoch={0}
          onToggleStatus={vi.fn()}
          onRefreshQuota={vi.fn()}
          onDelete={vi.fn()}
          onListModels={vi.fn()}
          onRefresh={vi.fn()}
          onDownload={vi.fn()}
          onEditSettings={vi.fn()}
        />,
      )
      unmount()
    }
    render(
      <AccountCard
        t={t}
        item={{
          ...account,
          provider: 'unknown',
          quota: [
            { key: 'empty', label: 'empty', status: 'unsupported' },
            { key: 'limit-0', label: 'limit-0', remainingPercent: 100, timeRemainingPercent: 81, periodHours: 5, status: 'known' },
            { key: 'summary', label: 'summary', remainingPercent: 100, periodHours: 168, status: 'known' },
            { key: 'weekly', label: 'weekly', remainingPercent: 36, status: 'known' },
            { key: 'monthly', label: 'monthly', status: 'known' },
          ],
        }}
        globalFace="B"
        globalEpoch={1}
        onToggleStatus={vi.fn()}
        onRefreshQuota={vi.fn()}
        onDelete={vi.fn()}
        onListModels={vi.fn()}
        onRefresh={vi.fn()}
        onDownload={vi.fn()}
        onEditSettings={vi.fn()}
      />,
    )
    expect(screen.getByText('unknown · Kimi')).toBeTruthy()
    expect(screen.getByText('5h 限额')).toBeTruthy()
    expect(screen.getByTitle('时间窗口剩余 81%')).toBeTruthy()
    expect(screen.getAllByText('周限额').length).toBeGreaterThan(0)
    expect(screen.getByText('月限额')).toBeTruthy()
    expect(screen.queryByText('limit-0')).toBeNull()
    expect(screen.queryByText('summary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '刷新额度' }))
    expect(screen.queryByRole('button', { name: '返回管理' })).toBeNull()
  })
})

describe('LoginModal', () => {
  it('cancels an authorizing device login', () => {
    const onCancel = vi.fn()
    render(
      <LoginModal
        t={t}
        initialProvider="kimi"
        login={{ kind: 'kimi', flow: 'device', state: 's1', url: 'https://example.test/device', userCode: 'ABCD' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={onCancel}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledWith('s1')
  })

  it('opens the device authorization URL through the Host system-browser action', () => {
    const onOpenExternal = vi.fn()
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } })
    render(
      <LoginModal
        t={t}
        initialProvider="xai"
        login={{ kind: 'xai', flow: 'device', state: 's1', url: 'https://accounts.x.ai/oauth2/device?user_code=SKGB-DPXT', userCode: 'SKGB-DPXT' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={onOpenExternal}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '复制链接' }))
    fireEvent.click(screen.getByRole('button', { name: '用浏览器打开授权页' }))
    expect(onOpenExternal).toHaveBeenCalledWith('https://accounts.x.ai/oauth2/device?user_code=SKGB-DPXT')
    expect(screen.queryByLabelText('回调 URL')).toBeNull()
  })

  it('starts PKCE from the select step and shows a failed result', () => {
    const onStart = vi.fn()
    const { rerender } = render(
      <LoginModal
        t={t}
        initialProvider="anthropic"
        onClose={vi.fn()}
        onStart={onStart}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /开始 ANTHROPIC 登录/ }))
    expect(onStart).toHaveBeenCalledWith('anthropic')
    rerender(
      <LoginModal
        t={t}
        initialProvider="anthropic"
        login={{ kind: 'anthropic', flow: 'pkce', error: 'denied' }}
        onClose={vi.fn()}
        onStart={onStart}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    expect(screen.getByText('denied')).toBeTruthy()
  })

  it('switches to GLM from the select step and submits a personal payload without organization', () => {
    const onClose = vi.fn()
    const onSubmitGlmKey = vi.fn()
    const { container } = render(
      <LoginModal
        t={t}
        initialProvider="xai"
        onClose={onClose}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={onSubmitGlmKey}
      />,
    )
    fireEvent.click(screen.getByTestId('provider-card-glm'))
    expect((screen.getByLabelText('个人') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText('团队 organization：')).toBeNull()
    fireEvent.change(screen.getByLabelText('订阅专用 API Key：'), { target: { value: 'glm-only' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并接入账号池' }))
    expect(onSubmitGlmKey).toHaveBeenCalledWith({ apiKey: 'glm-only', site: 'cn' })
    fireEvent.click(container.firstElementChild as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit a team GLM key until organization is set', () => {
    const onSubmitGlmKey = vi.fn()
    render(
      <LoginModal
        t={t}
        initialProvider="glm"
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={onSubmitGlmKey}
      />,
    )
    fireEvent.click(screen.getByLabelText('团队'))
    fireEvent.change(screen.getByLabelText('订阅专用 API Key：'), { target: { value: 'glm-team' } })
    expect((screen.getByRole('button', { name: '保存并接入账号池' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '保存并接入账号池' }))
    expect(onSubmitGlmKey).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('团队 organization：'), { target: { value: 'org-9' } })
    expect((screen.getByRole('button', { name: '保存并接入账号池' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '保存并接入账号池' }))
    expect(onSubmitGlmKey).toHaveBeenCalledWith({
      apiKey: 'glm-team',
      site: 'cn',
      organization: 'org-9',
    })
  })

  it('opens GLM directly and ignores dialog-body clicks', () => {
    const onClose = vi.fn()
    render(
      <LoginModal
        t={t}
        initialProvider="glm"
        onClose={onClose}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('添加账号凭证'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the GLM form when the Host reports a glm-key login', () => {
    render(
      <LoginModal
        t={t}
        initialProvider="glm"
        login={{ kind: 'glm', flow: 'glm-key' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    expect(screen.getByText('输入智谱 GLM Coding 订阅凭据')).toBeTruthy()
  })

  it('shows a failed XAI start and closes it', () => {
    const onClose = vi.fn()
    render(
      <LoginModal
        t={t}
        initialProvider="xai"
        login={{ kind: 'xai', flow: 'device', error: 'CLIProxyAPI account pool is unavailable' }}
        onClose={onClose}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    expect(screen.getByText('CLIProxyAPI account pool is unavailable')).toBeTruthy()
    fireEvent.click(screen.getByText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows PKCE browser-authorization copy without a device code', () => {
    render(
      <LoginModal
        t={t}
        initialProvider="codex"
        login={{ kind: 'codex', flow: 'pkce', state: 's2' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={vi.fn()}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    expect(screen.getByText(/PKCE 重定向/)).toBeTruthy()
    expect(screen.getByLabelText('回调 URL')).toBeTruthy()
  })

  it('submits a PKCE callback URL copied from the system browser', () => {
    const onSubmitCallback = vi.fn()
    render(
      <LoginModal
        t={t}
        initialProvider="codex"
        login={{ kind: 'codex', flow: 'pkce', state: 's2', url: 'https://auth.openai.com/authorize?state=s2' }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onOpenExternal={vi.fn()}
        onSubmitCallback={onSubmitCallback}
        onSubmitGlmKey={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('回调 URL'), {
      target: { value: 'http://localhost:1455/auth/callback?code=abc&state=s2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交回调 URL' }))
    expect(onSubmitCallback).toHaveBeenCalledWith({
      provider: 'codex',
      redirectUrl: 'http://localhost:1455/auth/callback?code=abc&state=s2',
    })
  })
})

describe('quota-display', () => {
  it('maps original management-center titles and hides unlabeled leftovers', () => {
    expect(quotaWindowTitle({ key: 'limit-0', label: 'limit-0', status: 'known' }, t)).toBe('5h 限额')
    expect(quotaWindowTitle({ key: 'summary', label: 'summary', status: 'known' }, t)).toBe('周限额')
    expect(quotaWindowTitle({ key: 'weekly', label: 'weekly', status: 'known' }, t)).toBe('周限额')
    expect(quotaWindowTitle({ key: 'monthly', label: 'monthly', status: 'known' }, t)).toBe('月限额')
    expect(quotaWindowTitle({ key: '5h', label: '5h', status: 'known' }, t)).toBe('5h 限额')
    expect(quotaWindowTitle({ key: 'five_hour', label: 'five_hour', periodHours: 5, status: 'known' }, t)).toBe('5h 限额')
    expect(quotaWindowTitle({ key: 'day', label: 'day', periodHours: 24, status: 'known' }, t)).toBe('日限额')
    expect(quotaWindowTitle({ key: 'week', label: 'week', periodHours: 168, status: 'known' }, t)).toBe('周限额')
    expect(quotaWindowTitle({ key: 'month', label: 'month', periodHours: 30 * 24, status: 'known' }, t)).toBe('月限额')
    expect(quotaWindowTitle({ key: 'limit-1', label: 'limit-1', periodHours: 12, status: 'known' }, t)).toBe('12h 限额')
    expect(quotaWindowTitle({ key: 'limit-1', label: 'limit-1', status: 'known' }, t)).toBeUndefined()
    expect(quotaWindowTitle({ key: 'custom', label: '团队额度', status: 'known' }, t)).toBe('团队额度')
    expect(quotaWindowTitle({ key: 'empty', label: 'empty', status: 'unsupported' }, t)).toBeUndefined()
    expect(quotaWindowTitle({
      key: 'additional-GPT-5.3-Codex-Spark-five-hour',
      label: 'GPT-5.3-Codex-Spark',
      periodHours: 5,
      status: 'known',
    }, t)).toBe('GPT-5.3-Codex-Spark 5h 限额')
    expect(quotaWindowTitle({
      key: 'pro-5h',
      label: 'Five Hour Limit Remaining',
      periodHours: 5,
      group: 'GEMINI 模型',
      status: 'known',
    }, t)).toBe('Five Hour Limit Remaining')
    expect(visibleQuotaWindows([
      { key: 'limit-0', label: 'limit-0', remainingPercent: 100, status: 'known' },
      { key: 'empty', label: 'empty', status: 'unsupported' },
    ], t).map(window => window.title)).toEqual(['5h 限额'])
    expect(quotaPlanLabel('pro')).toBe('Pro 20x')
    expect(quotaPlanLabel(undefined)).toBeUndefined()
  })

  it('formats reset stamps with a relative remainder', () => {
    const now = Date.parse('2026-09-11T14:17:00')
    expect(quotaResetText(undefined, t, now)).toBe('')
    expect(quotaResetText(Number.NaN, t, now)).toBe('')
    expect(quotaResetText(now - 30_000, t, now)).toMatch(/不到1分钟前/)
    expect(quotaResetText(now - 2 * 60_000, t, now)).toMatch(/2分钟前/)
    expect(quotaResetText(now - 60 * 60_000, t, now)).toMatch(/1小时前/)
    expect(quotaResetText(now + 6 * 24 * 60 * 60_000, t, now)).toMatch(/6天后/)
  })
})

describe('QuotaBarWithTimeline', () => {
  it('hides fill when the window is unreliable', () => {
    render(
      <QuotaBarWithTimeline
        name="5h 限额"
        resetText="未知"
        unknownLabel="未知"
        isReliable={false}
        percentRemaining={40}
      />,
    )
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0)
  })

  it('clamps overflow and still draws a time needle without a quota fill', () => {
    const { rerender } = render(
      <QuotaBarWithTimeline
        name="5h 限额"
        resetText="soon"
        unknownLabel="未知"
        timeRemainingLabel="时间窗口剩余 0%"
        isReliable={true}
        percentRemaining={140}
        timeRemainingPercent={-5}
      />,
    )
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByTitle('时间窗口剩余 0%')).toBeTruthy()
    rerender(
      <QuotaBarWithTimeline
        name="5h 限额"
        resetText="soon"
        unknownLabel="未知"
        timeRemainingLabel="时间窗口剩余 40%"
        isReliable={true}
        timeRemainingPercent={40}
      />,
    )
    expect(screen.getByText('未知')).toBeTruthy()
    expect(screen.getByTitle('时间窗口剩余 40%')).toBeTruthy()
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

function controlTree(snapshot: DesktopAccountPoolSnapshot) {
  return (
    <AccountPoolControl
      t={t as never}
      useAccountPool={select => select(snapshot)}
      useSessions={() => { throw new Error('unused') }}
      useWorkspaces={() => { throw new Error('unused') }}
      close={vi.fn()}
    />
  )
}

function renderControl(snapshot: DesktopAccountPoolSnapshot): ReturnType<typeof render> {
  return render(controlTree(snapshot))
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
    accountRefreshMobileInstallations: vi.fn(),
    accountRevokeMobileInstallation: vi.fn(),
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
    accountPoolDismissLogin: vi.fn(async () => ready),
    accountPoolOpenExternal: vi.fn(async () => {}),
    accountPoolSubmitCallback: vi.fn(async () => ready),
    accountPoolSubmitGlmKey: vi.fn(async () => ready),
    accountPoolRefreshQuota: vi.fn(async () => ready),
    accountPoolRefreshAllQuota: vi.fn(async () => ready),
    accountPoolListModels: vi.fn(async () => []),
    accountPoolDownload: vi.fn(async () => ({ ok: true })),
    accountPoolReadFields: vi.fn(async (name: string) => ({ name, info: { id: name }, fields: {} })),
    accountPoolPatchFields: vi.fn(async () => ready),
    onAccountPoolSnapshot: () => () => {},
    chromeOverlayShow: async () => {},
    chromeOverlayHide: async () => {},
    chromeOverlayGetState: async () => null,
    chromeOverlayResult: () => {},
    onChromeOverlayState: () => () => {},
    onChromeOverlayResult: () => () => {},
  }
}
