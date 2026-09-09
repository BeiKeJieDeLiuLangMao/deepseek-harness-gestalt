import { describe, expect, it, vi } from 'vitest'
import type { BrowserPageState, BrowserTarget } from '@deepseek-ai/dsh-browser-workspace/client'
import { OfficialBrowserRuntime } from '../src/client/official-browser.tsx'

const TARGET = { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' } as BrowserTarget
const PAGE: BrowserPageState = {
  status: 'open', target: TARGET, revision: 1, title: 'Created', url: 'https://example.test/', text: '', focused: true,
  chrome: { kind: 'shared', partition: 'persist:shared' },
  storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
}
const SECOND_TARGET = { ...TARGET, tabId: 't2' } as BrowserTarget
const SECOND_PAGE: BrowserPageState = { ...PAGE, target: SECOND_TARGET }

function harness(
  payload: unknown,
  operation: Promise<{ ok: true; value: BrowserPageState }>,
  options: { materialized?: boolean; workspace?: BrowserPageState } = {},
) {
  const update = vi.fn((_tabId: string, patch: { payload?: unknown }) => {
    if (Object.hasOwn(patch, 'payload')) tab.state.payload = patch.payload
  })
  const openTab = vi.fn(async () => 'browser:restored')
  const tab: {
    sessionId: string
    surface: string
    paneId: string
    floating: boolean
    active: boolean
    visible: boolean
    record: { id: string; kind: string; contentId: string; title: string }
    state: { payload: unknown }
  } = {
    sessionId: 's1', surface: 'right', paneId: 'pane', floating: false, active: true, visible: true,
    record: { id: 'browser:1', kind: 'browser', contentId: 'sidebar://browser/1', title: 'Browser' },
    state: { payload },
  }
  const listeners = new Set<() => void>()
  const browserWorkspace = {
    create: vi.fn(() => operation),
    close: vi.fn(async () => ({ ok: true as const, value: undefined })),
    observe: vi.fn(async () => ({ ok: true as const, value: PAGE })),
  }
  const ctx = {
    sidebarRight: {
      getSnapshot: () => ({
        sessions: options.materialized === false ? [] : [{ sessionId: 's1', tabs: [tab] }],
        pinned: [],
      }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      forSession: () => ({ update, openTab }),
    },
    sessions: { list: {
      getSnapshot: () => ({ current: 's1', byId: { s1: { projectionValues: {
        ...(options.workspace === undefined ? {} : { browserWorkspace: {
          activeWorkspaceId: 'w', workspaces: [{ workspaceId: 'w', profileId: 'p', activeBrowserId: 'b',
            browsers: [{ browserId: 'b', activeTabId: 't', tabs: [{
              tabId: options.workspace.target.tabId,
              revision: options.workspace.revision,
              url: options.workspace.url,
            }] }],
          }],
        } }),
      } } } }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } },
    remote: { browserWorkspace },
    browserUi: {
      createRequest: () => ({ profile: 'shared' }),
      recoverListedMutation: async (mutate: (...args: never[]) => Promise<unknown>, _observe: unknown, ...args: never[]) =>
        await mutate(...args),
    },
  }
  return { runtime: new OfficialBrowserRuntime(ctx as never), update, openTab, ctx }
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
        activeWorkspaceId: TARGET.workspaceId, workspaces: [{
          workspaceId: TARGET.workspaceId,
          profileId: TARGET.profileId,
          activeBrowserId: TARGET.browserId,
          browsers: [{
            browserId: TARGET.browserId,
            activeTabId: TARGET.tabId,
            tabs: [{ tabId: TARGET.tabId, revision: 1, url: PAGE.url }],
          }],
        }],
      } } } },
    })
    await expect(runtime.close({ sessionId: 's1', payload: { target: TARGET } } as never)).rejects.toThrow('close failed')
  })

  it('waits for the Sidebar Session to materialize before restoring a projected page', () => {
    const { runtime, openTab } = harness(
      { target: TARGET },
      Promise.resolve({ ok: true, value: PAGE }),
      { materialized: false, workspace: PAGE },
    )
    runtime.subscribe()
    expect(openTab).not.toHaveBeenCalled()
  })

  it('lets an unbound occurrence claim its pending page before restoring unclaimed pages', async () => {
    const reply = Promise.withResolvers<{ ok: true; value: BrowserPageState }>()
    const { runtime, update, openTab } = harness({}, reply.promise, { workspace: PAGE })
    runtime.subscribe()
    expect(openTab).not.toHaveBeenCalled()
    reply.resolve({ ok: true, value: PAGE })
    await reply.promise
    await Promise.resolve()
    expect(update).toHaveBeenCalledWith('browser:1', {
      payload: {
        target: TARGET,
        profile: { kind: 'shared' },
        url: 'https://example.test/',
      },
      title: 'Created',
    })
    expect(openTab).not.toHaveBeenCalled()
  })

  it('restores other pages after an unbound occurrence finishes or fails', async () => {
    const created = Promise.withResolvers<{ ok: true; value: BrowserPageState }>()
    const successful = harness({}, created.promise, { workspace: PAGE })
    successful.runtime.subscribe()
    created.resolve({ ok: true, value: SECOND_PAGE })
    await created.promise
    await vi.waitFor(() => { expect(successful.openTab).toHaveBeenCalledOnce() })
    expect(successful.openTab).toHaveBeenCalledWith('browser', expect.objectContaining({
      instanceId: 'p/w/b/t',
    }))

    const rejected = Promise.reject(new Error('create failed'))
    rejected.catch(() => undefined)
    const failed = harness({}, rejected, { workspace: PAGE })
    failed.runtime.subscribe()
    await vi.waitFor(() => {
      expect(failed.update).toHaveBeenCalledWith('browser:1', {
        payload: { createError: 'create failed' },
      })
      expect(failed.openTab).toHaveBeenCalledOnce()
    })
  })
})
