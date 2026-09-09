import { describe, expect, it, vi } from 'vitest'
import type { BrowserPageState, BrowserTarget } from '@deepseek-ai/dsh-browser-workspace/client'
import { OfficialBrowserRuntime } from '../src/client/official-browser.tsx'

const TARGET = { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' } as BrowserTarget
const PAGE: BrowserPageState = {
  status: 'open', target: TARGET, revision: 1, title: 'Created', url: 'https://example.test/', text: '', focused: true,
  chrome: { kind: 'shared', partition: 'persist:shared' },
  storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
}

function harness(payload: unknown, operation: Promise<{ ok: true; value: BrowserPageState }>) {
  const update = vi.fn()
  const tab = {
    sessionId: 's1', surface: 'right', paneId: 'pane', floating: false, active: true, visible: true,
    record: { id: 'browser:1', kind: 'browser', contentId: 'sidebar://browser/1', title: 'Browser' },
    state: { payload },
  }
  const listeners = new Set<() => void>()
  const ctx = {
    sidebarRight: {
      getSnapshot: () => ({ sessions: [{ sessionId: 's1', tabs: [tab] }], pinned: [] }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      forSession: () => ({ update, openTab: vi.fn() }),
    },
    sessions: { list: {
      getSnapshot: () => ({ current: 's1', byId: { s1: { projectionValues: {} } } }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } },
    remote: { browserWorkspace: { create: vi.fn(() => operation) } },
    browserUi: {
      createRequest: () => ({ profile: 'shared' }),
      recoverListedMutation: async (mutate: (...args: never[]) => Promise<unknown>, _observe: unknown, ...args: never[]) =>
        await mutate(...args),
    },
  }
  return { runtime: new OfficialBrowserRuntime(ctx as never), update, ctx }
}

describe('workbench provider lifecycle', () => {
  it('drops a pending create reply after provider disposal', async () => {
    const reply = Promise.withResolvers<{ ok: true; value: BrowserPageState }>()
    const { runtime, update } = harness({}, reply.promise)
    const dispose = runtime.subscribe()
    dispose()
    reply.resolve({ ok: true, value: PAGE })
    await reply.promise
    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()
  })

  it('drops a pending recovery reply after provider disposal', async () => {
    const reply = Promise.withResolvers<{ ok: true; value: BrowserPageState }>()
    const { runtime, update } = harness({ target: TARGET, url: PAGE.url }, reply.promise)
    const dispose = runtime.subscribe()
    const recovery = runtime.recover('s1' as never, 'browser:1', TARGET)
    expect(update).toHaveBeenCalledOnce()
    dispose()
    update.mockClear()
    reply.resolve({ ok: true, value: PAGE })
    await recovery
    expect(update).not.toHaveBeenCalled()
  })

  it('propagates close failures so the official occurrence remains retryable', async () => {
    const rejected = Promise.reject(new Error('close failed'))
    rejected.catch(() => undefined)
    const { runtime, ctx } = harness({ target: TARGET }, Promise.resolve({ ok: true, value: PAGE }))
    ctx.remote.browserWorkspace.close = vi.fn(() => rejected)
    ctx.remote.browserWorkspace.observe = vi.fn()
    ctx.sessions.list.getSnapshot = () => ({
      current: 's1', byId: { s1: { projectionValues: { browserWorkspace: {
        activeWorkspaceId: 'w', workspaces: [{ workspaceId: 'w', profileId: 'p', activeBrowserId: 'b',
          browsers: [{ browserId: 'b', activeTabId: 't', tabs: [{ tabId: 't', revision: 1 }] }],
        }],
      } } } },
    })
    await expect(runtime.close({ sessionId: 's1', payload: { target: TARGET } } as never)).rejects.toThrow('close failed')
  })
})
