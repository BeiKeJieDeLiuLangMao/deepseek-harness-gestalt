/**
 * Registration contract of the IM GUI: Settings IM Accounts, workspace
 * takeover/simulation cards, and the official Sidebar conversation tab.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, IM_DEFINITION_ID, NS, zh } from '../src/client/index.ts'

class SidebarTabsUnderTest {
  definition: { readonly id: string; readonly kind: string } | undefined
  register(definition: { readonly id: string; readonly kind: string }): () => void {
    this.definition = definition
    return () => { this.definition = undefined }
  }
}

async function mount() {
  const ctx = new Context()
  const tabs = new SidebarTabsUnderTest()
  ctx.provide('sidebarRightTabs', tabs)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
      'workspace.settings.section': { kind: 'list', scope: 'root' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const ok = async <T>(value: T) => ({ ok: true as const, value })
  const imConfig = {
    listAccounts: () => ok([]),
    listRouteRules: () => ok([]),
    listSimulationConfigs: () => ok([]),
    upsertAccount: () => ok(undefined),
    pauseAccount: () => ok(undefined),
    deleteAccount: () => ok(undefined),
    createRouteRule: () => ok(undefined),
    updateRouteRule: () => ok(undefined),
    setSimulationConfig: () => ok(undefined),
    deleteSimulationConfig: () => ok(undefined),
  }
  const imDelivery = {
    queryHistory: () => ok([]),
    listOutbound: () => ok([]),
    registerManualOutbound: () => ok(undefined),
    cancelPendingAiOutbound: () => ok([]),
  }
  const imSimulation = {
    listInstances: () => ok([]),
    createInstance: () => ok(undefined),
    injectMemberMessage: () => ok(undefined),
  }
  ctx.provide('remote', { imConfig, imDelivery, imSimulation })
  ctx.provide('remote.imConfig', imConfig)
  ctx.provide('remote.imDelivery', imDelivery)
  ctx.provide('remote.imSimulation', imSimulation)
  ctx.provide('uiWorkspace', { openWorkspace: async () => undefined })
  const fiber = ctx.plugin({
    inject: [...inject],
    apply: (pluginCtx: Context) => { apply(pluginCtx) },
  })
  await fiber.await()
  return { ctx, fiber, tabs }
}

describe('ui-im client apply', () => {
  it('declares slots, locale, and Sidebar tab service edges', () => {
    expect([...inject]).toEqual([
      'slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.imConfig', 'remote.imDelivery', 'remote.imSimulation', 'uiWorkspace',
    ])
  })

  it('registers IM Accounts, workspace cards, and the conversation tab', async () => {
    const { ctx, fiber, tabs } = await mount()
    const accounts = ctx.slots.entries('settings.section').find(entry => entry.options.id === 'im-accounts')
    expect(accounts?.options).toMatchObject({ id: 'im-accounts', order: 45 })
    expect(accounts?.locale).toBe(NS)
    const label = accounts?.options.label
    expect(typeof label === 'function' ? label() : label).toBe(zh.nav)
    const workspace = ctx.slots.entries('workspace.settings.section').map(entry => entry.options.id)
    expect(workspace).toEqual(['im-takeover', 'im-simulation'])
    expect(tabs.definition).toMatchObject({ id: IM_DEFINITION_ID, kind: 'im-conversation' })
    expect(ctx.slots.entries('sidebar.right.pane.tab').some(entry => entry.options.key === IM_DEFINITION_ID)).toBe(true)
    await fiber.dispose()
    expect(ctx.slots.entries('settings.section')).toHaveLength(0)
    expect(ctx.slots.entries('workspace.settings.section')).toHaveLength(0)
    expect(tabs.definition).toBeUndefined()
  })
})
