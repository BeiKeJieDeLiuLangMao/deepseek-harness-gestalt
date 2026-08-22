// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseInstallationId,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
  type AccountSessionView,
  type LoginAttemptView,
} from '@deepseek-ai/dsh-platform-account'
import {
  MemoryInstallationAccountStore,
  PlatformAccountInstallation,
  type PlatformAccountTransport,
} from '@deepseek-ai/dsh-platform-account-client'
import { MobileAccount } from '../src/MobileAccount.tsx'
import {
  CompanionForegroundRuntime,
  installCompanionRuntime,
} from '../src/companion-lifecycle.ts'

const environment = selectPlatformEnvironment(validatePlatformEnvironmentPair({
  development: {
    environment: 'development', origin: 'https://dev.example',
    callbackUrl: 'https://dev.example/v1/account/oauth/github/callback',
    githubClientId: 'mobile-development', credentialReference: 'credentials://development',
    databaseIdentity: 'database-development', identityNamespace: 'namespace-development',
  },
  production: {
    environment: 'production', origin: 'https://prod.example',
    callbackUrl: 'https://prod.example/v1/account/oauth/github/callback',
    githubClientId: 'mobile-production', credentialReference: 'credentials://production',
    databaseIdentity: 'database-production', identityNamespace: 'namespace-production',
  },
}), 'development')

const attempt: LoginAttemptView = {
  id: 'attempt-mobile-snapshot' as never,
  state: 'state-mobile-snapshot',
  authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=mobile',
  pollingToken: 'polling-mobile-snapshot',
  expiresAt: Date.now() + 300_000,
}

const accountSession: AccountSessionView = {
  sessionId: 'session-mobile-snapshot' as never,
  account: {
    id: 'account-mobile-snapshot' as never,
    githubId: 583231,
    githubLogin: 'octocat',
    avatarUrl: 'https://avatars.example/octocat',
  },
  accessToken: 'access-mobile-snapshot',
  refreshToken: 'refresh-mobile-snapshot',
  accessExpiresAt: Date.now() + 900_000,
  refreshExpiresAt: Date.now() + 2_592_000_000,
}

afterEach(cleanup)

describe('Mobile real entry foreground mutation gate', () => {
  it('keeps every human-visible mutation control disabled before validated resync', async () => {
    const runtime = new CompanionForegroundRuntime()
    const disposeRuntime = installCompanionRuntime(runtime)
    const transport: PlatformAccountTransport = {
      environment,
      beginLogin: vi.fn<PlatformAccountTransport['beginLogin']>().mockResolvedValue(attempt),
      pollLogin: vi.fn<PlatformAccountTransport['pollLogin']>().mockResolvedValue({
        status: 'complete', ...accountSession,
      }),
      refresh: vi.fn<PlatformAccountTransport['refresh']>(),
      current: vi.fn<PlatformAccountTransport['current']>(),
      signOut: vi.fn<PlatformAccountTransport['signOut']>().mockResolvedValue(undefined),
    }
    const installation = new PlatformAccountInstallation({
      environment,
      installationId: parseInstallationId('mobile-snapshot'),
      installationKind: 'mobile',
      transport,
      store: new MemoryInstallationAccountStore(),
      systemBrowser: { open: vi.fn() },
      crypto: globalThis.crypto,
    })
    render(createElement(MobileAccount, {
      installation,
      companionSurface: {
        sessions: [{
          id: 'guarded-session',
          title: 'Guarded Session',
          workspace: 'Work',
          summary: 'Pending Desktop work',
          blocks: [
            { kind: 'approval', summary: 'Allow write' },
            { kind: 'ask-user', question: 'Continue?' },
          ],
        }],
        onCreate: vi.fn(),
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        onAttach: vi.fn(),
        streaming: true,
        onSettled: vi.fn(),
      },
    }))

    fireEvent.click(await screen.findByRole('checkbox'))
    const login = screen.getByRole('button', { name: '使用 GitHub 继续' })
    await waitFor(() => { expect(login.hasAttribute('disabled')).toBe(false) })
    fireEvent.click(login)
    await screen.findByText('@octocat')

    expect(visibleMutationControls()).toMatchInlineSnapshot(`
      [
        "button:新建 Ungrouped Session:disabled",
        "button:在 Work 新建 Session:disabled",
      ]
    `)

    fireEvent.click(screen.getByRole('button', { name: /Guarded Session/ }))
    expect(visibleMutationControls()).toMatchInlineSnapshot(`
      [
        "button:允许:disabled",
        "button:允许:disabled",
        "textbox:继续会话:disabled",
        "button:发送:disabled",
        "button:取消:disabled",
        "button:添加附件:disabled",
      ]
    `)
    disposeRuntime()
  })
})

function visibleMutationControls(): string[] {
  const names = new Set(['新建 Ungrouped Session', '在 Work 新建 Session', '允许', '继续会话', '发送', '取消', '添加附件'])
  return [...document.querySelectorAll('button, textarea')].flatMap((element) => {
    const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''
    if (!names.has(name)) return []
    const role = element.getAttribute('role') ?? (element instanceof HTMLTextAreaElement ? 'textbox' : 'button')
    return [`${role}:${name}:${element.hasAttribute('disabled') ? 'disabled' : 'enabled'}`]
  })
}
