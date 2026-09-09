// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AccountCard } from '../src/client/prototype/AccountCard.tsx'
import { QuotaBarWithTimeline } from '../src/client/prototype/QuotaBarWithTimeline.tsx'
import { LoginModal } from '../src/client/prototype/LoginModal.tsx'
import { MOCK_ACCOUNTS } from '../src/client/prototype/mock-data.ts'

describe('v3 Core Behavior & Integrity Tests (Final Strict Gate)', () => {
  // Test 1: AccountCard local override is independent and reset by globalEpoch
  it('v3-1: AccountCard local flip overrides globalFace, and resets on globalEpoch bump', () => {
    const item = MOCK_ACCOUNTS[1] // Antigravity Workspace
    const { getByTestId, rerender } = render(
      <AccountCard item={item} globalFace="A" globalEpoch={0} />
    )

    const card = getByTestId(`account-card-${item.id}`)
    expect(card.getAttribute('data-current-face')).toBe('A')
    expect(getByTestId('card-face-a')).toBeDefined()

    // Flip single card to B independently
    const flipBtn = getByTestId(`card-flip-btn-${item.id}`)
    fireEvent.click(flipBtn)
    expect(card.getAttribute('data-current-face')).toBe('B')
    expect(getByTestId('card-face-b')).toBeDefined()

    // Parent stays at globalFace="A" but bumps epoch (e.g. user clicked global 'A') -> resets card override to A
    rerender(<AccountCard item={item} globalFace="A" globalEpoch={1} />)
    expect(card.getAttribute('data-current-face')).toBe('A')
    expect(getByTestId('card-face-a')).toBeDefined()
  })

  // Test 2: QuotaBarWithTimeline unreliable metrics do NOT render fill/marker/legend
  it('v3-2: QuotaBarWithTimeline renders no fill, needle, or legend when unreliable', () => {
    const { container, getByText } = render(
      <QuotaBarWithTimeline
        percentRemaining={80}
        timeRemainingPercent={50}
        name="Test Unreliable Metric"
        windowLabel="5h"
        resetText="待刷新"
        isReliable={false}
      />
    )

    // Should display '未知' text
    expect(getByText('未知')).toBeDefined()
    // Must NOT render quotaFill
    expect(container.querySelector('[class*="quotaFill"]')).toBeNull()
    // Must NOT render timelineMarker
    expect(container.querySelector('[class*="timelineMarker"]')).toBeNull()
    // Must NOT render legendRow
    expect(container.querySelector('[class*="legendRow"]')).toBeNull()
  })

  // Test 3: mock-data all accounts strictly use @example.com and generalized filenames
  it('v3-3: All mock-data accounts strictly use @example.com without personal leakage', () => {
    expect(MOCK_ACCOUNTS.length).toBeGreaterThan(0)
    for (const acc of MOCK_ACCOUNTS) {
      expect(acc.accountEmail).toMatch(/^[a-z0-9-]+@example\.com$/)
      expect(acc.filename).toMatch(/@example\.com/)
      expect(acc.filename).not.toMatch(/gmail\.com|moonshot\.cn|bigmodel\.cn/)
    }
  })

  // Test 4: LoginModal uses provider-specific .example.test/verify and prominent simulation notices
  it('v3-4: LoginModal renders non-operational provider-specific .example.test/verify URIs with simulation warning and consistent device code', () => {
    // Kimi Device Flow: verify URI contains KIMI-1234 device code matching display
    const { getByText, getByTestId, unmount } = render(
      <LoginModal initialProvider="kimi" onClose={() => {}} onSuccess={() => {}} />
    )
    fireEvent.click(getByText('开始 KIMI 登录'))
    expect(getByTestId('auth-fixture-url').textContent).toBe('https://kimi.example.test/verify?code=KIMI-1234')
    expect(getByText('KIMI-1234')).toBeDefined()
    expect(getByText(/模拟授权.*不可真实登录.*不向任何第三方发起外部网络请求/)).toBeDefined()
    unmount()

    // xAI Device Flow
    const xai = render(<LoginModal initialProvider="xai" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(xai.getByText('开始 XAI 登录'))
    expect(xai.getByTestId('auth-fixture-url').textContent).toBe('https://xai.example.test/verify?code=GROK-7890')
    expect(xai.getByText('GROK-7890')).toBeDefined()
    xai.unmount()

    // Codex PKCE Flow
    const codex = render(<LoginModal initialProvider="codex" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(codex.getByText('开始 CODEX 登录'))
    expect(codex.getByTestId('auth-fixture-url').textContent).toBe('https://codex.example.test/verify')
    codex.unmount()

    // Anthropic PKCE Flow
    const claude = render(<LoginModal initialProvider="anthropic" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(claude.getByText('开始 ANTHROPIC 登录'))
    expect(claude.getByTestId('auth-fixture-url').textContent).toBe('https://anthropic.example.test/verify')
    claude.unmount()

    // Antigravity PKCE Flow
    const antigravity = render(<LoginModal initialProvider="antigravity" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(antigravity.getByText('开始 ANTIGRAVITY 登录'))
    expect(antigravity.getByTestId('auth-fixture-url').textContent).toBe('https://antigravity.example.test/verify')
    antigravity.unmount()

    // GLM Coding Plan dedicated endpoint form
    const glm = render(<LoginModal initialProvider="glm" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(glm.getByText('配置 GLM 订阅凭据'))
    expect(glm.getByText('输入智谱 GLM Coding 订阅凭据 (CN个人订阅)')).toBeDefined()
    expect(glm.getByDisplayValue('https://open.bigmodel.cn/api/coding/paas/v4')).toBeDefined()
    glm.unmount()
  })
})
