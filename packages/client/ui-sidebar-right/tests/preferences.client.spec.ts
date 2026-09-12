/** Official ownership of the retained global Sidebar settings document. */
import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  parseSidebarRightPreferences,
  SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
  SidebarRightPreferencesController,
  type SidebarRightPreferences,
} from '../src/client/preferences.ts'

interface FakeScope {
  readonly scope: SettingsScope<SidebarRightPreferences>
  readonly mutate: ReturnType<typeof vi.fn<SettingsScope<SidebarRightPreferences>['mutate']>>
  publish(snapshot: SettingsScopeSnapshot<SidebarRightPreferences>): void
}

function fakeScope(initial: SettingsScopeSnapshot<SidebarRightPreferences>): FakeScope {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const mutate = vi.fn<SettingsScope<SidebarRightPreferences>['mutate']>(async () => {})
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      mutate,
      set: async () => {},
      unset: async () => {},
    },
    mutate,
    publish(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function scopeSnapshot(
  status: SettingsScopeSnapshot<SidebarRightPreferences>['status'],
  value?: SidebarRightPreferences,
): SettingsScopeSnapshot<SidebarRightPreferences> {
  return {
    status,
    value,
    base: undefined,
    user: undefined,
    revision: value === undefined ? undefined : 7,
    writable: value !== undefined,
    mode: 'host',
  }
}

describe('official Sidebar preferences', () => {
  it('keeps all 30 retained fields and defaults malformed fields independently', () => {
    expect(Object.keys(SIDEBAR_RIGHT_PREFERENCES_DEFAULTS)).toHaveLength(30)
    const parsed = parseSidebarRightPreferences({
      openByDefault: true,
      defaultWidthPercent: 99,
      terminalFontSize: 4,
      browserInterceptHttps: true,
      tabsEnabled: { terminal: false, invalid: 'no' },
      viewersEnabled: { html: false },
      pluginSettings: {
        editor: { openWith: { pinned: ['vscode'] } },
        invalid: { value: undefined },
      },
    })
    expect(parsed).toMatchObject({
      openByDefault: true,
      defaultWidthPercent: 60,
      terminalFontSize: 9,
      browserInterceptHttps: true,
      tabsEnabled: { terminal: false },
      viewersEnabled: { html: false },
      pluginSettings: { editor: { openWith: { pinned: ['vscode'] } } },
    })
    expect(parsed.pluginSettings).not.toHaveProperty('invalid')
    expect(parsed.workspaceFence).toBe(true)
  })

  it('adopts explicit schemes and converts configured legacy inset documents to custom', () => {
    expect(parseSidebarRightPreferences({ titleBarScheme: 'web' }).titleBarScheme).toBe('web')
    expect(parseSidebarRightPreferences({ titleBarCompat: true }).titleBarScheme).toBe('custom')
    expect(parseSidebarRightPreferences({ titleBarStripPx: 55 }).titleBarScheme).toBe('custom')
    expect(parseSidebarRightPreferences({ titleBarScheme: 'unknown' }).titleBarScheme).toBe('auto')
  })

  it('publishes one stable projection and disconnects its settings subscription', () => {
    const fake = fakeScope(scopeSnapshot('loading'))
    const controller = new SidebarRightPreferencesController(fake.scope)
    const listener = vi.fn()
    controller.subscribe(listener)
    const disconnect = controller.connect()
    const ready = { ...SIDEBAR_RIGHT_PREFERENCES_DEFAULTS, htmlViewerDefaultUnsafe: true }
    fake.publish(scopeSnapshot('ready', ready))
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', preferences: ready, revision: 7, writable: true })
    expect(controller.htmlViewerSafety()).toEqual({ forceUnsandboxed: false, defaultUnsandboxed: true })
    expect(listener).toHaveBeenCalledOnce()
    disconnect()
    fake.publish(scopeSnapshot('unavailable'))
    expect(listener).toHaveBeenCalledOnce()
  })

  it('writes independent map paths and snapshots plugin JSON before crossing the settings seam', async () => {
    const fake = fakeScope(scopeSnapshot('ready', SIDEBAR_RIGHT_PREFERENCES_DEFAULTS))
    const controller = new SidebarRightPreferencesController(fake.scope)
    await controller.setTabEnabled('terminal', false)
    await controller.setViewerEnabled('html', false)
    const value = { nested: ['safe'] }
    await controller.setPluginSetting('editor', 'openWith', value)
    value.nested.push('caller mutation')
    await controller.setPluginSetting('editor', 'removed', undefined)
    expect(fake.mutate.mock.calls.map(([ops]) => ops)).toEqual([
      [{ op: 'set', path: ['tabsEnabled', 'terminal'], value: false }],
      [{ op: 'set', path: ['viewersEnabled', 'html'], value: false }],
      [{ op: 'set', path: ['pluginSettings', 'editor', 'openWith'], value: { nested: ['safe'] } }],
      [{ op: 'unset', path: ['pluginSettings', 'editor', 'removed'] }],
    ])
  })
})
