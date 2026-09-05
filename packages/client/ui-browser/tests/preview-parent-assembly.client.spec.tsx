// @vitest-environment jsdom
/**
 * Chat-declared conversation.browser.preview: parent apply authorizes the
 * occupant, the preview follows the current Session, and Chat unload drops
 * the contribution.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import {
  SlotTestRuntime, TestRemote, stubSettingsScope, usePinnedBrowserLanguages,
} from '@deepseek-ai/dsh-client-test-runtime'
import {
  apply as applyConversation, inject as injectConversation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  apply as applyChat, inject as injectChat,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { BrowserWorkspaceProjection } from '@deepseek-ai/dsh-browser-workspace/client'
import { apply, inject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

const ALPHA = 'session-alpha' as SessionId
const BETA = 'session-beta' as SessionId

const TARGET = {
  profileId: 'profile-1',
  workspaceId: 'ws-1',
  browserId: 'br-1',
  tabId: 'tab-1',
} as const

function listing(): BrowserWorkspaceProjection {
  return {
    activeWorkspaceId: TARGET.workspaceId as BrowserWorkspaceProjection['activeWorkspaceId'],
    workspaces: [{
      workspaceId: TARGET.workspaceId as BrowserWorkspaceProjection['workspaces'][number]['workspaceId'],
      profileId: TARGET.profileId as BrowserWorkspaceProjection['workspaces'][number]['profileId'],
      activeBrowserId: TARGET.browserId as BrowserWorkspaceProjection['workspaces'][number]['activeBrowserId'],
      browsers: [{
        browserId: TARGET.browserId as BrowserWorkspaceProjection['workspaces'][number]['browsers'][number]['browserId'],
        activeTabId: TARGET.tabId as BrowserWorkspaceProjection['workspaces'][number]['browsers'][number]['activeTabId'],
        tabs: [{
          tabId: TARGET.tabId as BrowserWorkspaceProjection['workspaces'][number]['browsers'][number]['tabs'][number]['tabId'],
          revision: 3,
        }],
      }],
    }],
  }
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  runtime.ctx.provide('layout', { openDetails: vi.fn(), closeDetails: vi.fn() } as never)
  runtime.ctx.provide('uiWorkspace', { connectWorkspace: vi.fn(async () => ALPHA) } as never)
  new TestRemote(runtime.ctx, {
    session: { openWorkspacePath: vi.fn(async () => ({ ok: true, value: { opened: true } })) },
    browserWorkspace: {
      focus: vi.fn(async () => ({ ok: true, value: {} })),
      observe: vi.fn(async () => ({ ok: true, value: {} })),
      screenshot: vi.fn(async () => ({ ok: true, value: {} })),
    },
  })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.root.declare({
    'conversation': { kind: 'single', scope: 'session-maybe' },
    'details': { kind: 'single', scope: 'session' },
    'conversation.approval.detail': { kind: 'single', scope: 'session' },
    'settings.general.item': { kind: 'list', scope: 'root' },
    'settings.section': { kind: 'list', scope: 'root' },
  }, ({ renderSlot }: { renderSlot: (key: string, owner: object) => unknown }) => (
    <>{renderSlot('conversation', {})}</>
  ) as never)
  await runtime.sessions.add({ id: ALPHA, summary: { title: 'Alpha', displayTitle: 'Alpha' } })
  await runtime.sessions.add({ id: BETA, summary: { title: 'Beta', displayTitle: 'Beta' } }, { current: false })
  const conversation = await runtime.mount({ inject: [...injectConversation], apply: applyConversation })
  const chat = await runtime.mount({ inject: [...injectChat], apply: applyChat })
  const browser = await runtime.mount({ inject: [...inject], apply })
  runtime.sessions.binding(ALPHA)!.session.projections.set('browserWorkspace', listing())
  const view = runtime.renderRoot()
  return { runtime, conversation, chat, browser, view }
}

describe('Chat-declared Browser preview occupancy', () => {
  it('authorizes the preview from Chat apply and paints it for the current Session', async () => {
    const b = await bench()
    expect(b.runtime.slots.spec('conversation.browser.preview'))
      .toMatchObject({ kind: 'single', scope: 'session' })
    expect(b.runtime.slots.entries('conversation.browser.preview')).toHaveLength(1)
    expect(b.view.container.querySelector('[data-browser-preview]')).not.toBeNull()
    expect(b.view.container.querySelector('[data-browser-preview-rail]')).not.toBeNull()
    await b.runtime.dispose()
  })

  it('hides when the current Session has no tabs and restores after switch', async () => {
    const b = await bench()
    expect(b.view.container.querySelector('[data-browser-preview]')).not.toBeNull()
    await act(async () => { await b.runtime.sessions.open(BETA) })
    expect(b.view.container.querySelector('[data-browser-preview]')).toBeNull()
    await act(async () => { await b.runtime.sessions.open(ALPHA) })
    expect(b.view.container.querySelector('[data-browser-preview]')).not.toBeNull()
    await b.runtime.dispose()
  })

  it('drops the occupant when Chat unloads the parent declaration', async () => {
    const b = await bench()
    expect(b.runtime.slots.entries('conversation.browser.preview')).toHaveLength(1)
    await b.chat.dispose()
    expect(b.runtime.slots.spec('conversation.browser.preview')).toBeUndefined()
    expect(b.runtime.slots.entries('conversation.browser.preview')).toHaveLength(0)
    expect(b.view.container.querySelector('[data-browser-preview]')).toBeNull()
    expect(b.runtime.slots.entries('conversation')).toHaveLength(1)
    await b.runtime.dispose()
  })
})
