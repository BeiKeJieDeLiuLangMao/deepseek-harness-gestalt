/** Client apply binds official pages; Host apply lives in apply.host.spec.ts. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import * as browserPlugin from '@deepseek-ai/dsh-client-ui-browser/client'
import { apply as applyClient, inject as clientInject } from '../src/client/index.ts'

const TARGET = { profileId: 'p', workspaceId: 'w', browserId: 'b', tabId: 't' }

describe('ui-workbench client apply', () => {
  it('fails loud when the snapshot client has not published betterSidebar', () => {
    expect([...clientInject]).toEqual([
      'betterSidebar', 'sessions', 'remote', 'remote.browserWorkspace', 'browserUi',
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
    await mountBrowser(ctx)
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
    await mountBrowser(ctx)
    await expect(ctx.plugin({ inject: [...clientInject], apply: applyClient }).await()).resolves.toBeDefined()
  })
})

async function mountBrowser(ctx: Context) {
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const settings = stubSettingsScope()
  ctx.provide('settingsScope', { bind: () => settings.scope })
  const fiber = ctx.plugin(browserPlugin)
  await fiber.await()
  return { fiber, settings }
}

it.each([true, false])('activates only while browserUi is provided (provider first: %s)', async (providerFirst) => {
  const ctx = new Context()
  class RemoteService extends Service {
    constructor() { super(ctx, 'remote') }
  }
  new RemoteService()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn(() => unsubscribe)
  ctx.provide('betterSidebar', { getSnapshot: () => ({}), subscribeState: subscribe })
  ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }), subscribe } })
  ctx.provide('remote.browserWorkspace', {})
  const provider = providerFirst ? await mountBrowser(ctx) : undefined
  const consumer = ctx.plugin({ inject: [...clientInject], apply: applyClient })
  await consumer.await()
  if (!providerFirst) {
    expect(ctx.get('workbenchBrowser')).toBeUndefined()
    expect(subscribe).not.toHaveBeenCalled()
  }
  const mounted = provider ?? await mountBrowser(ctx)
  await consumer.await()
  expect(ctx.get('workbenchBrowser')).toBeDefined()
  const face = ctx.get('workbenchBrowser') as import('../src/client/index.ts').WorkbenchBrowserFace
  expect(face.createRequest()).toEqual({ profile: 'shared' })
  mounted.settings.publish({ status: 'ready', value: { defaultKind: 'temporary' } })
  expect(face.createRequest()).toEqual({ profile: 'temporary' })
  mounted.settings.publish({ status: 'ready', value: { defaultKind: 'persistent', defaultPersistentName: 'work' } })
  expect(face.createRequest()).toEqual({ profile: 'persistent', name: 'work' })
  await mounted.fiber.dispose()
  await consumer.await()
  expect(ctx.get('browserUi')).toBeUndefined()
  expect(ctx.get('workbenchBrowser')).toBeUndefined()
  expect(subscribe).toHaveBeenCalledTimes(2)
  expect(unsubscribe).toHaveBeenCalledTimes(2)
  const reloaded = ctx.plugin(browserPlugin)
  await reloaded.await()
  await consumer.await()
  expect(ctx.get('workbenchBrowser')).toBeDefined()
  await consumer.dispose()
  await reloaded.dispose()
})
