import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import * as browserPlugin from '@deepseek-ai/dsh-client-ui-browser/client'
import type { BrowserPageState, BrowserTarget, BrowserWorkspaceProjection } from '@deepseek-ai/dsh-browser-workspace/client'
import { apply, inject, type WorkbenchBrowserFace } from '../src/client/index.ts'
import { officialTabMeta } from '../src/official-tab-meta.ts'

const TARGET = { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' } as BrowserTarget
const PAGE: BrowserPageState = {
  status: 'open', target: TARGET, revision: 1, title: 'Created', url: 'https://example.test/',
  text: '', focused: true, chrome: { kind: 'shared', partition: 'persist:shared' },
  storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
}

function projection(): BrowserWorkspaceProjection {
  return {
    activeWorkspaceId: TARGET.workspaceId,
    workspaces: [{
      workspaceId: TARGET.workspaceId, profileId: TARGET.profileId, activeBrowserId: TARGET.browserId,
      browsers: [{
        browserId: TARGET.browserId, activeTabId: TARGET.tabId,
        tabs: [{ tabId: TARGET.tabId, revision: PAGE.revision, url: PAGE.url }],
      }],
    }],
  }
}

describe('workbench provider lifecycle', () => {
  it.each(['create', 'close', 'recovery'] as const)('quiesces pending %s before provider reload', async (operation) => {
    const ctx = new Context()
    class RemoteService extends Service {
      constructor() { super(ctx, 'remote') }
    }
    new RemoteService()
    const creation = Promise.withResolvers<{ ok: true; value: BrowserPageState }>()
    const closure = Promise.withResolvers<{ ok: true; value: undefined }>()
    const create = vi.fn(() => creation.promise)
    const close = vi.fn(() => closure.promise)
    const navigate = vi.fn(async () => ({ ok: true as const, value: PAGE }))
    let tabs: Array<{ id: string; type: string; meta?: unknown; path?: string }> = [{
      id: 'browser:1', type: 'browser',
      ...operation === 'create' ? { path: PAGE.url } : { meta: officialTabMeta(TARGET, { kind: 'shared' }) },
    }]
    let listing = operation === 'create' ? undefined : projection()
    const listeners = new Set<() => void>()
    const unsubscribe = vi.fn()
    const subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener); unsubscribe() }
    }
    const updateTab = vi.fn((id: string, patch: { title?: string; meta?: unknown }) => {
      tabs = tabs.map(tab => tab.id === id ? { ...tab, ...patch } : tab)
    })
    ctx.provide('betterSidebar', {
      openTab: vi.fn(), updateTab, closeTab: vi.fn(), activateTab: vi.fn(), setPanelOpen: vi.fn(),
      getSnapshot: () => ({ sessionId: 's1', state: { splits: { kind: 'leaf', tabs } } }),
      subscribeState: subscribe,
    })
    ctx.provide('sessions', {
      list: {
        getSnapshot: () => ({ byId: { s1: { projectionValues: { browserWorkspace: listing } } } }),
        subscribe,
      },
    })
    ctx.provide('remote.browserWorkspace', { create, close, navigate })
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const settings = stubSettingsScope()
    ctx.provide('settingsScope', { bind: () => settings.scope })
    const provider = ctx.plugin(browserPlugin)
    let stopping: Promise<void> | undefined
    let recovery: Promise<BrowserPageState | undefined> | undefined
    try {
      await provider.await()
      const consumer = ctx.plugin({ inject: [...inject], apply })
      await consumer.await()
      const oldFace = ctx.get('workbenchBrowser') as WorkbenchBrowserFace
      if (operation === 'close') {
        tabs = []
        for (const listener of listeners) listener()
        await vi.waitFor(() => { expect(close).toHaveBeenCalledOnce() })
      } else {
        if (operation === 'recovery') recovery = oldFace.recoverOfficial('browser:1', TARGET)
        await vi.waitFor(() => { expect(create).toHaveBeenCalledOnce() })
      }
      updateTab.mockClear()
      let stopped = false
      stopping = (async () => {
        await provider.dispose()
        await consumer.await()
        stopped = true
      })()
      await vi.waitFor(() => { expect(unsubscribe).toHaveBeenCalledTimes(2) })
      const stoppedBeforeReply = stopped
      listing = operation === 'close' ? undefined : projection()
      creation.resolve({ ok: true, value: PAGE })
      closure.resolve({ ok: true, value: undefined })
      await Promise.all([stopping, recovery])
      await consumer.await()
      expect(stoppedBeforeReply).toBe(false)
      expect(updateTab).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
      oldFace.ensureOfficial('browser:1')
      await oldFace.recoverOfficial('browser:1', TARGET)
      const replacement = ctx.plugin(browserPlugin)
      await replacement.await()
      await consumer.await()
      expect(ctx.get('workbenchBrowser')).toBeDefined()
      expect(create).toHaveBeenCalledTimes(operation === 'close' ? 0 : 1)
      expect(close).toHaveBeenCalledTimes(operation === 'close' ? 1 : 0)
      expect(updateTab).toHaveBeenCalledTimes(operation === 'close' ? 0 : 1)
    } finally {
      creation.resolve({ ok: true, value: PAGE })
      closure.resolve({ ok: true, value: undefined })
      await stopping
      await recovery
      await ctx.fiber.dispose()
    }
  })
})
