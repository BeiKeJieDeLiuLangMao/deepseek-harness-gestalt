import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

const PAGE = {
  status: 'open' as const,
  target: { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' },
  revision: 1,
  title: 'Created',
  url: 'https://example.test/',
  text: '', focused: true,
  chrome: { kind: 'shared' as const, partition: 'persist:shared' },
  storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
}

async function base() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const tab = {
    sessionId: 's1', surface: 'right', paneId: 'pane', floating: false, active: true, visible: true,
    record: { id: 'browser:1', kind: 'browser', contentId: 'sidebar://browser/browser:1', title: 'Browser' },
    state: { payload: {} },
  }
  const update = vi.fn()
  const openTab = vi.fn(async () => 'browser:1')
  const listeners = new Set<() => void>()
  ctx.provide('sidebarRight', {
    getSnapshot: () => ({ mountedSessionId: 's1', pinned: [], sessions: [{ sessionId: 's1', tabs: [tab] }] }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    forSession: () => ({ update, openTab }),
  })
  const register = vi.fn(() => () => {})
  ctx.provide('sidebarRightTabs', { register })
  ctx.provide('sidebarRightPreferences', { getSnapshot: () => ({ preferences: {} }), subscribe: () => () => {} })
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => ({ current: 's1', byId: { s1: { projectionValues: {} } } }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
  })
  const browserWorkspace = { create: vi.fn(async () => ({ ok: true, value: PAGE })) }
  ctx.provide('remote', { browserWorkspace })
  ctx.provide('remote.browserWorkspace', browserWorkspace)
  ctx.provide('browserUi', {
    createRequest: () => ({ profile: 'shared' }), renderPageChrome: vi.fn(), recoverListedMutation: vi.fn(),
  })
  return { ctx, update, register, openTab }
}

describe('ui-workbench client apply', () => {
  it('declares only official Browser dependencies', () => {
    expect([...inject]).toEqual([
      'slots', 'sessions', 'remote', 'remote.browserWorkspace', 'browserUi', 'locale',
      'sidebarRight', 'sidebarRightTabs', 'sidebarRightPreferences',
    ])
  })

  it('registers the official implementation and binds an empty occurrence', async () => {
    const { ctx, update, register } = await base()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(update).toHaveBeenCalled() })
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ kind: 'browser', priority: 'extension' }))
    expect(ctx.get('workbenchBrowser')).toEqual({ reveal: expect.any(Function) })
  })

  it('reveals the projected page through its Session navigator', async () => {
    const { ctx, openTab } = await base()
    const sessions = ctx.sessions.list as { getSnapshot: () => unknown }
    sessions.getSnapshot = () => ({
      current: 's1',
      byId: { s1: { projectionValues: { browserWorkspace: {
        activeWorkspaceId: 'w', workspaces: [{ workspaceId: 'w', profileId: 'p', activeBrowserId: 'b',
          browsers: [{ browserId: 'b', activeTabId: 't', tabs: [{ tabId: 't', revision: 1, url: PAGE.url }] }],
        }],
      } } } },
    })
    await ctx.plugin({ inject: [...inject], apply }).await()
    ctx.workbenchBrowser.reveal('s1')
    await vi.waitFor(() => { expect(openTab).toHaveBeenCalled() })
  })
})
