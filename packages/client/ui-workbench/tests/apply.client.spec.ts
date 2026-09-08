/** Client apply binds official pages; Host apply lives in apply.host.spec.ts. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply as applyClient, inject as clientInject } from '../src/client/index.ts'

const TARGET = { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' }

describe('ui-workbench client apply', () => {
  it('fails loud when the snapshot client has not published betterSidebar', () => {
    expect([...clientInject]).toEqual([
      'betterSidebar', 'sessions', 'remote', 'remote.browserWorkspace', 'settingsScope',
    ])
    const ctx = new Context()
    expect(() => { applyClient(ctx) }).toThrow(/betterSidebar is not published/)
  })

  it('publishes workbenchBrowser and ticks the official-page bridge', async () => {
    const ctx = new Context()
    class RemoteService extends Service {
      constructor() { super(ctx, 'remote') }
    }
    new RemoteService()
    const sidebar = {
      openTab: vi.fn(),
      updateTab: vi.fn(),
      closeTab: vi.fn(),
      activateTab: vi.fn(),
      setPanelOpen: vi.fn(),
      getSnapshot: () => ({
        sessionId: 's1',
        state: {
          panelOpen: false,
          splits: { kind: 'leaf' as const, tabs: [{ id: 'browser:1', type: 'browser' }] },
        },
      }),
      subscribeState: (listener: () => void) => {
        listener()
        return () => {}
      },
    }
    ctx.provide('betterSidebar', sidebar)
    ctx.provide('remote.browserWorkspace', {
      create: async () => ({
        ok: true as const,
        value: {
          status: 'open',
          target: { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' },
          title: 'Created',
        },
      }),
    })
    ctx.provide('sessions', {
      list: {
        getSnapshot: () => ({ byId: { s1: { projectionValues: {} } } }),
        subscribe: (listener: () => void) => {
          listener()
          return () => {}
        },
      },
    })
    ctx.provide('settingsScope', {
      bind: () => ({
        getSnapshot: () => ({ value: { defaultKind: 'shared', defaultPersistentName: '', namedProfiles: [] } }),
      }),
    })
    await ctx.plugin({ inject: [...clientInject], apply: applyClient }).await()
    await Promise.resolve()
    expect(sidebar.updateTab).toHaveBeenCalled()
    const face = ctx.get('workbenchBrowser') as {
      reveal: (id: string) => void
      renderTab: (props: { ctx: Context; tab: { id: string }; scope: { sessionId: string } }) => unknown
      createRequest: () => { profile: string }
      ensureOfficial: (tabId: string) => void
      recoverOfficial: (tabId: string, target: typeof TARGET) => Promise<unknown>
    }
    expect(typeof face.reveal).toBe('function')
    expect(typeof face.renderTab).toBe('function')
    expect(typeof face.createRequest).toBe('function')
    expect(typeof face.ensureOfficial).toBe('function')
    expect(typeof face.recoverOfficial).toBe('function')
    face.reveal('s1')
    expect(sidebar.setPanelOpen).toHaveBeenCalledWith(true)
    expect(face.renderTab({ ctx, tab: { id: 'browser:1' }, scope: { sessionId: 's1' } })).toBeTruthy()
    expect(face.createRequest()).toEqual({ profile: 'shared' })
    face.ensureOfficial('browser:1')
    await expect(face.recoverOfficial('browser:1', TARGET)).resolves.toBeUndefined()
  })

  it('subscribes only to the session list when subscribeState is absent', async () => {
    const ctx = new Context()
    class RemoteService extends Service {
      constructor() { super(ctx, 'remote') }
    }
    new RemoteService()
    ctx.provide('betterSidebar', {
      openTab: vi.fn(),
      updateTab: vi.fn(),
      closeTab: vi.fn(),
      activateTab: vi.fn(),
      setPanelOpen: vi.fn(),
      getSnapshot: () => ({}),
    })
    ctx.provide('remote.browserWorkspace', {})
    ctx.provide('sessions', {
      list: {
        getSnapshot: () => ({ byId: {} }),
        subscribe: () => () => {},
      },
    })
    ctx.provide('settingsScope', {
      bind: () => ({ getSnapshot: () => ({ value: undefined }) }),
    })
    await expect(ctx.plugin({ inject: [...clientInject], apply: applyClient }).await()).resolves.toBeDefined()
  })
})
