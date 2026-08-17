// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AccountSessionView, LoginAttemptView } from '@deepseek-ai/dsh-platform-account'
import {
  MemoryInstallationAccountStore,
  PlatformAccountInstallation,
  type PlatformAccountTransport,
} from '@deepseek-ai/dsh-platform-account-client'
import { MobileAccount } from '../src/MobileAccount.tsx'

afterEach(cleanup)

const attempt: LoginAttemptView = {
  id: 'attempt-mobile' as never,
  state: 'state-mobile',
  authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=mobile',
  pollingToken: 'polling-mobile',
  expiresAt: Date.now() + 300_000,
}

const session: AccountSessionView = {
  sessionId: 'session-mobile' as never,
  account: {
    id: 'account-mobile' as never,
    githubId: 583231,
    githubLogin: 'octocat',
    avatarUrl: 'https://avatars.example/octocat',
  },
  accessToken: 'access-mobile',
  refreshToken: 'refresh-mobile',
  accessExpiresAt: Date.now() + 900_000,
  refreshExpiresAt: Date.now() + 2_592_000_000,
}

describe('MobileAccount', () => {
  it('shows both privacy notices and blocks GitHub until consent', async () => {
    const { installation, openSystemBrowser } = fixture()
    render(createElement(MobileAccount, { installation }))

    expect(screen.getByText(/Platform 会保存 GitHub 数字 ID/)).toBeTruthy()
    expect(screen.getByText(/Platform stores the numeric GitHub id/)).toBeTruthy()
    const continueButton = screen.getByRole('button', { name: '使用 GitHub 继续' })
    expect(continueButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(continueButton)
    await waitFor(() => { expect(openSystemBrowser).toHaveBeenCalledWith(attempt.authorizationUrl) })
  })

  it('polls to the current-installation account and signs out only that installation', async () => {
    const { installation, api } = fixture()
    render(createElement(MobileAccount, { installation }))

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 继续' }))
    await screen.findByText('@octocat')
    expect(screen.getByText('当前安装')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '退出此安装' }))
    await waitFor(() => { expect(api.signOut).toHaveBeenCalledOnce() })
    await screen.findByRole('button', { name: '使用 GitHub 继续' })
  })
})

function fixture(): {
  installation: PlatformAccountInstallation
  api: MockTransport
  openSystemBrowser: ReturnType<typeof vi.fn>
} {
  const api: MockTransport = {
    beginLogin: vi.fn<PlatformAccountTransport['beginLogin']>().mockResolvedValue(attempt),
    pollLogin: vi.fn<PlatformAccountTransport['pollLogin']>().mockResolvedValue({ status: 'complete', ...session }),
    refresh: vi.fn<PlatformAccountTransport['refresh']>(),
    current: vi.fn<PlatformAccountTransport['current']>(),
    signOut: vi.fn<PlatformAccountTransport['signOut']>().mockResolvedValue(undefined),
  }
  const openSystemBrowser = vi.fn()
  return {
    api,
    openSystemBrowser,
    installation: new PlatformAccountInstallation({
      environment: 'development',
      installationId: 'mobile-ui',
      installationKind: 'mobile',
      transport: api,
      store: new MemoryInstallationAccountStore(),
      openSystemBrowser,
      crypto: globalThis.crypto,
    }),
  }
}

interface MockTransport {
  beginLogin: Mock<PlatformAccountTransport['beginLogin']>
  pollLogin: Mock<PlatformAccountTransport['pollLogin']>
  refresh: Mock<PlatformAccountTransport['refresh']>
  current: Mock<PlatformAccountTransport['current']>
  signOut: Mock<PlatformAccountTransport['signOut']>
}
