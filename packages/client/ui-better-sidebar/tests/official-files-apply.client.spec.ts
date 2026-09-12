import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { DocumentSourceEditor } from '../src/client/official-files/DocumentSourceEditor.tsx'
import { OfficialEditorHost } from '../src/client/official-files/OfficialEditorHost.tsx'
import { OFFICIAL_EDITOR_DOCUMENT_IDS, OFFICIAL_EDITOR_ID, OFFICIAL_FILE_ID } from '../src/client/official-files/definitions.ts'
import { registerOfficialFiles } from '../src/client/official-files/index.ts'
import { OfficialOpenWithSettings } from '../src/client/official-files/OpenWithSettings.tsx'

describe('official file supplements', () => {
  it('keeps an explicit folder tree while file previews stay with documentpreview', () => {
    const effects: Array<() => void> = []
    const definitions: unknown[] = []
    const editors: unknown[] = []
    const entries: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const ctx = {
      effect: (factory: () => (() => void), _label: string) => { const dispose = factory(); effects.push(dispose); return dispose },
      sidebarRightTabs: { register: (definition: unknown) => { definitions.push(definition); return () => { definitions.splice(definitions.indexOf(definition), 1) } } },
      documentEditors: { register: (definition: unknown) => { editors.push(definition); return () => { editors.splice(editors.indexOf(definition), 1) } } },
      sidebarRightPreferences: {},
      slots: {
        inject: vi.fn((_name: string, factory: () => () => void) => factory()),
        register: (options: Record<string, unknown>, component: unknown) => { const entry = { options, component }; entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
      },
    }

    registerOfficialFiles(ctx as unknown as ClientContext)

    expect(definitions).toMatchObject([{ id: OFFICIAL_FILE_ID, kind: 'file', hidden: true }])
    expect(definitions[0]).not.toHaveProperty('patterns')
    expect(editors).toEqual([{ id: OFFICIAL_EDITOR_ID, documentIds: OFFICIAL_EDITOR_DOCUMENT_IDS }])
    expect(entries.map(entry => [entry.options.name, entry.options.key, entry.component])).toEqual([
      ['sidebar.right.pane.tab', OFFICIAL_FILE_ID, OfficialEditorHost],
      ...OFFICIAL_EDITOR_DOCUMENT_IDS.map(key => ['sidebar.right.tab.document.editor', key, DocumentSourceEditor]),
      ['sidebar.right.tab.settings', OFFICIAL_FILE_ID, OfficialOpenWithSettings],
    ])

    for (const dispose of effects.reverse()) dispose()
    expect(definitions).toEqual([])
    expect(editors).toEqual([])
    expect(entries).toEqual([])
  })
})
