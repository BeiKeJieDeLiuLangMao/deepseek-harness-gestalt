import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type {
  SidebarRightTabDefinition,
  SidebarRightViewerDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { OfficialEditorHost } from '../src/client/official-files/OfficialEditorHost.tsx'
import { OFFICIAL_FILE_ID } from '../src/client/official-files/definitions.ts'
import { registerOfficialFiles } from '../src/client/official-files/index.ts'
import { OfficialOpenWithSettings } from '../src/client/official-files/OpenWithSettings.tsx'

describe('official file registration', () => {
  it('owns the type, six viewers, keyed bodies, and settings for one effect lifetime', () => {
    const effects: Array<() => void> = []
    const definitions: SidebarRightTabDefinition[] = []
    const viewers: SidebarRightViewerDefinition[] = []
    const entries: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const remove = <T,>(items: T[], item: T): void => { items.splice(items.indexOf(item), 1) }
    const ctx = {
      effect: (factory: () => (() => void), _label: string) => {
        const dispose = factory()
        effects.push(dispose)
        return dispose
      },
      sidebarRightTabs: {
        register: (definition: SidebarRightTabDefinition) => {
          definitions.push(definition)
          return () => { remove(definitions, definition) }
        },
        registerViewer: (viewer: SidebarRightViewerDefinition) => {
          viewers.push(viewer)
          return () => { remove(viewers, viewer) }
        },
      },
      sidebarRightPreferences: {},
      slots: {
        inject: vi.fn((_name: string, factory: () => () => void) => factory()),
        register: (options: Record<string, unknown>, component: unknown) => {
          const entry = { options, component }
          entries.push(entry)
          return () => { remove(entries, entry) }
        },
      },
    }

    registerOfficialFiles(ctx as unknown as ClientContext)

    expect(definitions.map(definition => definition.id)).toEqual([OFFICIAL_FILE_ID])
    expect(viewers.map(viewer => viewer.id)).toEqual([
      'image', 'pdf', 'markdown', 'html', 'code', 'binary-download',
    ])
    expect(entries.map(entry => [entry.options.name, entry.options.key])).toEqual([
      ['sidebar.right.pane.tab', OFFICIAL_FILE_ID],
      ['sidebar.right.file.viewer', 'image'],
      ['sidebar.right.file.viewer', 'pdf'],
      ['sidebar.right.file.viewer', 'markdown'],
      ['sidebar.right.file.viewer', 'html'],
      ['sidebar.right.file.viewer', 'code'],
      ['sidebar.right.file.viewer', 'binary-download'],
      ['sidebar.right.tab.settings', OFFICIAL_FILE_ID],
    ])
    expect(entries[0]?.component).toBe(OfficialEditorHost)
    expect(entries.at(-1)?.component).toBe(OfficialOpenWithSettings)

    for (const dispose of effects.reverse()) dispose()
    expect(definitions).toEqual([])
    expect(viewers).toEqual([])
    expect(entries).toEqual([])
  })
})
