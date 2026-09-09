// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AccountCard } from '../src/client/prototype/AccountCard.tsx'
import { QuotaBarWithTimeline } from '../src/client/prototype/QuotaBarWithTimeline.tsx'
import { LoginModal } from '../src/client/prototype/LoginModal.tsx'
import { MOCK_ACCOUNTS } from '../src/client/prototype/mock-data.ts'

describe('v3 Core Behavior & Integrity Tests', () => {
  // Test v3-1: AccountCard face state controlled by globalFace, overrideable by local flip, resettable by globalEpoch
  it('v3-1: AccountCard flips independently and resets on globalEpoch change', () => {
    const item = MOCK_ACCOUNTS[1] // Antigravity Workspace
    const { getByTestId, rerender } = render(
      <AccountCard item={item} globalFace="A" globalEpoch={0} />
    )

    const card = getByTestId(`account-card-${item.id}`)
    expect(card.getAttribute('data-current-face')).toBe('A')
    expect(getByTestId('card-face-a')).toBeDefined()

    // Flip single card to B
    const flipBtn = getByTestId(`card-flip-btn-${item.id}`)
    fireEvent.click(flipBtn)
    expect(card.getAttribute('data-current-face')).toBe('B')
    expect(getByTestId('card-face-b')).toBeDefined()

    // Rerender with globalFace="A" and new epoch -> resets to A
    rerender(<AccountCard item={item} globalFace="A" globalEpoch={1} />)
    expect(card.getAttribute('data-current-face')).toBe('A')
    expect(getByTestId('card-face-a')).toBeDefined()
  })

  // Test v3-2: QuotaBarWithTimeline does NOT render any fill/marker/legend when isReliable is false
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

  // Test v3-3: mock-data all accounts use @example.com and generalized filenames
  it('v3-3: All mock-data accounts strictly use @example.com without personal leakage', () => {
    expect(MOCK_ACCOUNTS.length).toBeGreaterThan(0)
    for (const acc of MOCK_ACCOUNTS) {
      expect(acc.accountEmail).toMatch(/^[a-z0-9-]+@example\.com$/)
      expect(acc.filename).toMatch(/@example\.com/)
      expect(acc.filename).not.toMatch(/gmail\.com|moonshot\.cn|bigmodel\.cn/)
    }
  })

  // Test v3-4: LoginModal uses provider-specific .example.test URIs and fixture indicators
  it('v3-4: LoginModal renders provider-specific .example.test URIs and avoids hardcoded OpenAI URL', () => {
    // Kimi Device Flow
    const { getByText, unmount } = render(
      <LoginModal initialProvider="kimi" onClose={() => {}} onSuccess={() => {}} />
    )
    fireEvent.click(getByText('开始 KIMI 登录'))
    expect(getByText(/auth\.kimi\.example\.test/)).toBeDefined()
    expect(getByText('KIMI-1234')).toBeDefined()
    unmount()

    // xAI Device Flow
    const xaiRender = render(<LoginModal initialProvider="xai" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(xaiRender.getByText('开始 XAI 登录'))
    expect(xaiRender.getByText(/auth\.x\.ai\.example\.test/)).toBeDefined()
    expect(xaiRender.getByText('GROK-7890')).toBeDefined()
    xaiRender.unmount()

    // Codex PKCE Flow
    const codexRender = render(<LoginModal initialProvider="codex" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(codexRender.getByText('开始 CODEX 登录'))
    expect(codexRender.getByText(/auth\.openai\.example\.test/)).toBeDefined()
    codexRender.unmount()

    // GLM Coding Plan dedicated endpoint form
    const glmRender = render(<LoginModal initialProvider="glm" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.click(glmRender.getByText('配置 GLM 订阅凭据'))
    expect(glmRender.getByText('输入智谱 GLM Coding 订阅凭据 (CN个人订阅)')).toBeDefined()
    glmRender.unmount()
  })
})
