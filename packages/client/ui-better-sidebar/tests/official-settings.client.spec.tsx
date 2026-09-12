// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { SIDEBAR_RIGHT_PREFERENCES_DEFAULTS } from '../../ui-sidebar-right/src/client/preferences.ts'
import type {
  SidebarRightTabDefinition,
  SidebarRightViewerDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SideCardSection } from '../src/client/SideCardSection.tsx'
import {
  OFFICIAL_SETTINGS_INJECT,
  registerOfficialSidebarSettings,
  type OfficialSettingsContext,
} from '../src/client/official-settings.ts'

afterEach(cleanup)

const tab: SidebarRightTabDefinition = {
  id: 'spec/tab',
  kind: 'spec',
  title: () => 'Spec tab',
  settings: {
    settingsId: 'retained-spec',
    fields: [{
      key: 'openByDefault',
      source: 'preference',
      title: () => 'Open by default',
    }],
    custom: true,
  },
}

const viewer: SidebarRightViewerDefinition = {
  id: 'spec/viewer',
  title: () => 'Spec viewer',
  extensions: ['spec'],
  fetchStrategy: 'none',
}

function officialFaces() {
  const listeners = new Set<() => void>()
  const tabEntries = [tab]
  const viewerEntries = [viewer]
  const snapshot = {
    status: 'ready' as const,
    preferences: SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
    revision: 1,
    writable: true,
  }
  const setTabEnabled = vi.fn(() => Promise.resolve())
  const setViewerEnabled = vi.fn(() => Promise.resolve())
  const setPluginSetting = vi.fn(() => Promise.resolve())
  const update = vi.fn(() => Promise.resolve())
  return {
    listeners,
    setTabEnabled,
    setViewerEnabled,
    setPluginSetting,
    update,
    tabs: {
      entries: () => tabEntries,
      viewers: () => viewerEntries,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    preferences: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      setTabEnabled,
      setViewerEnabled,
      setPluginSetting,
      update,
    },
  }
}

describe('official Side card settings', () => {
  it('registers one section that owns the two root-scoped custom settings seats', () => {
    const faces = officialFaces()
    const entries: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const ctx = {
      sidebarRightTabs: faces.tabs,
      sidebarRightPreferences: faces.preferences,
      slots: {
        inject: (_name: string, register: () => () => void) => register(),
        register: (options: Record<string, unknown>, component: unknown) => {
          const entry = { options, component }
          entries.push(entry)
          return () => { entries.splice(entries.indexOf(entry), 1) }
        },
      },
    } as unknown as OfficialSettingsContext

    expect(OFFICIAL_SETTINGS_INJECT).toEqual(['slots', 'sidebarRightTabs', 'sidebarRightPreferences'])
    const dispose = registerOfficialSidebarSettings(ctx)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options).toMatchObject({
      name: 'settings.section',
      id: 'better-sidebar',
      children: {
        'sidebar.right.tab.settings': { kind: 'keyed', scope: 'root' },
        'sidebar.right.viewer.settings': { kind: 'keyed', scope: 'root' },
      },
    })
    dispose()
    expect(entries).toEqual([])
  })

  it('reads the official inventories, writes their enable maps, and dispatches custom settings by descriptor id', () => {
    const faces = officialFaces()
    const renderSlot = vi.fn(() => <div data-official-custom-settings />)
    const close = vi.fn()
    const view = render(<SideCardSection {...({
      tabs: faces.tabs,
      preferences: faces.preferences,
      renderSlot,
      close,
    } as unknown as Parameters<typeof SideCardSection>[0])} />)

    expect(view.getByText('Spec tab')).toBeTruthy()
    expect(view.getByText('Spec viewer')).toBeTruthy()
    const tabTitle = view.getByText('Spec tab')
    const tabButton = tabTitle.closest('button')
    if (tabButton === null) throw new Error('expected tab inventory button')
    fireEvent.click(tabButton)
    expect(faces.setTabEnabled).toHaveBeenCalledWith('spec/tab', false)

    const card = tabButton.parentElement
    const settingsButton = card?.querySelectorAll('button')[1]
    if (settingsButton === undefined) throw new Error('expected descriptor settings button')
    fireEvent.click(settingsButton)
    expect(renderSlot).toHaveBeenCalledWith('sidebar.right.tab.settings', {
      descriptorId: 'spec/tab',
      settingsId: 'retained-spec',
      close,
    }, { entryKey: 'spec/tab' })
    expect(document.querySelector('[data-official-custom-settings]')).not.toBeNull()
  })
})
