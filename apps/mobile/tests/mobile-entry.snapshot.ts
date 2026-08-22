// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
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
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import { CompanionForegroundRuntime, installCompanionRuntime } from '../src/companion-lifecycle.ts'
import { mountMobileEntry } from '../src/mobile-entry.tsx'
import type {
  MobileCompanionConnectionChannel, ValidatedDesktopSurfaceResync,
} from '../src/companion-surface.ts'
import { fixedMobilePresentationClock } from '../src/mobile-clock.ts'

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

describe('Mobile shipped entry foreground mutation gate', () => {
  it('binds receipts and history pages to the current-generation bundled entry', async () => {
    const runtime = new CompanionForegroundRuntime()
    const disposeRuntime = installCompanionRuntime(runtime)
    const installation = installationWithCompletedLogin()
    const root = document.createElement('div')
    document.body.append(root)

    const mounted = mountMobileEntry(root, {
      installation,
      companion: runtime,
      clock: fixedMobilePresentationClock(10_000),
    })
    const surface = mounted.companionSurface

    fireEvent.click(await screen.findByRole('checkbox'))
    const login = screen.getByRole('button', { name: '使用 GitHub 继续' })
    await waitFor(() => { expect(login.hasAttribute('disabled')).toBe(false) })
    fireEvent.click(login)
    await screen.findByText('@octocat')

    runtime.configure({
      routeId: parseRelayRouteId('route-mobile-snapshot'),
      endpoint: 'mobile',
      credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
      revision: 1,
    })
    runtime.markConnectionOpen()
    const firstChannel = connectionChannel()
    const firstResync = surface.bindAuthenticatedConnection(firstChannel)
    if (firstResync === undefined) throw new Error('expected first Desktop surface resync receiver')
    firstResync.acceptValidatedDesktopResync({
      type: 'desktop-resync',
      version: 1,
      authenticated: true,
      desktopName: 'Guarded Desktop',
      sessions: guardedSessions(),
      workspaces: [{
        workspaceId: 'guarded-workspace',
        path: '/work', title: 'Work', sessionIds: ['guarded-session'],
        createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
      }],
      conversations: [guardedConversation()],
    })
    await screen.findByRole('treeitem', { name: /Guarded Session/ })

    expect(screen.getByRole('button', { name: 'New ungrouped Session' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('treeitem', { name: /Guarded Session/ }))
    expect(screen.getByRole('button', { name: 'Allow once' }).hasAttribute('disabled')).toBe(false)
    firstChannel.mutations.settle.mockResolvedValueOnce({ accepted: false, reason: 'not-pending' })
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Allow once' }).hasAttribute('disabled')).toBe(false)
    })
    expect(firstChannel.mutations.settle).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'guarded-session', interactionId: 'guarded-approval',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier' }))
    expect(firstChannel.mutations.loadOlder).toHaveBeenCalledWith('guarded-session')
    firstResync.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true, desktopName: 'Guarded Desktop',
      sessions: guardedSessions(),
      workspaces: [{
        workspaceId: 'guarded-workspace', path: '/work', title: 'Work', sessionIds: ['guarded-session'],
        createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
      }],
      conversations: [guardedConversation(true)],
    })
    await screen.findByText('Older page')
    expect(screen.queryByRole('button', { name: 'Load earlier' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    runtime.forgetConnection()
    runtime.markConnectionOpen()
    firstResync.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true, desktopName: 'Stale Desktop',
      sessions: guardedSessions(), workspaces: [], conversations: [],
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New ungrouped Session' }).hasAttribute('disabled')).toBe(true)
    })
    expect(visibleMutationControls()).toMatchInlineSnapshot(`
      [
        "button:New ungrouped Session:disabled",
        "button:New Session in Work:disabled",
      ]
    `)

    fireEvent.click(screen.getByRole('treeitem', { name: /Guarded Session/ }))
    expect(visibleMutationControls()).toMatchInlineSnapshot(`
      [
        "button:Allow once:disabled",
      ]
    `)

    mounted.unmount()
    disposeRuntime()
  })
})

function guardedSessions() {
  return {
    ids: ['guarded-session'],
    byId: {
      'guarded-session': {
        id: 'guarded-session', title: 'Guarded Session', displayTitle: 'Guarded Session', cwd: '/work',
        running: true, pendingInteraction: 'approval' as const, blank: false, updatedAt: 1,
      },
    },
    current: null,
    phase: 'ready' as const,
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: null,
  }
}

function installationWithCompletedLogin(): PlatformAccountInstallation {
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
  return new PlatformAccountInstallation({
    environment,
    installationId: parseInstallationId('mobile-snapshot'),
    installationKind: 'mobile',
    transport,
    store: new MemoryInstallationAccountStore(),
    systemBrowser: { open: vi.fn() },
    crypto: globalThis.crypto,
  })
}

function guardedConversation(complete = false): ValidatedDesktopSurfaceResync['conversations'][number] {
  return {
    sessionId: 'guarded-session',
    nodes: [
      ...(complete
        ? [{
          kind: 'user' as const, seq: 1, time: 1, source: null,
          content: [{ type: 'text' as const, text: 'Older page' }],
        }]
        : []),
      {
        kind: 'user' as const, seq: 2, time: 2, source: null,
        content: [{ type: 'text' as const, text: 'Current page' }],
      },
    ],
    turnTimings: [],
    turnEnds: [],
    partial: null,
    runningCalls: [],
    pending: [{
      kind: 'approval', interactionId: 'guarded-approval', sessionId: 'guarded-session',
      payload: { approvalId: 'guarded-approval-id' as never, toolName: 'write', reason: 'Allow write' },
    }],
    queue: [],
    running: true,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: !complete,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  }
}

function connectionChannel() {
  const mutations = {
    create: vi.fn<MobileCompanionConnectionChannel['mutations']['create']>(),
    submit: vi.fn<MobileCompanionConnectionChannel['mutations']['submit']>(),
    cancel: vi.fn<MobileCompanionConnectionChannel['mutations']['cancel']>(),
    attach: vi.fn<MobileCompanionConnectionChannel['mutations']['attach']>(),
    loadOlder: vi.fn<MobileCompanionConnectionChannel['mutations']['loadOlder']>(),
    settle: vi.fn<MobileCompanionConnectionChannel['mutations']['settle']>(),
  }
  return {
    mutations,
    content: { loadImage: vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=') },
  } satisfies MobileCompanionConnectionChannel
}

function visibleMutationControls(): string[] {
  const names = new Set(['New ungrouped Session', 'New Session in Work', 'Allow once'])
  return [...document.querySelectorAll('button, textarea')].flatMap((element) => {
    const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''
    if (!names.has(name)) return []
    const role = element.getAttribute('role') ?? (element instanceof HTMLTextAreaElement ? 'textbox' : 'button')
    return [`${role}:${name}:${element.hasAttribute('disabled') ? 'disabled' : 'enabled'}`]
  })
}
