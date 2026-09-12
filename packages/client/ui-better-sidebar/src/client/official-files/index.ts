/** Register Better tree and editing capabilities under official Sidebar ownership. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { LOCALE_NS } from '../locales.ts'
import { api } from '../api.ts'
import { appendToDraft } from '../conversation-draft.ts'
import { OfficialEditorHost } from './OfficialEditorHost.tsx'
import { DocumentSourceEditor, type DocumentSourceEditorInjected } from './DocumentSourceEditor.tsx'
import { OFFICIAL_EDITOR_DOCUMENT_IDS, OFFICIAL_EDITOR_ID, OFFICIAL_FILE_ID, officialBuiltinViewers, officialFileDefinition } from './definitions.ts'
import { officialFileFace } from './face.ts'
import { OfficialFileRuntime } from './runtime.ts'
import { OfficialOpenWithSettings, type OfficialOpenWithInjected } from './OpenWithSettings.tsx'
import { createOfficialFilesStore } from './store.ts'

/** Install an explicit folder tree plus renderer-keyed editors; files remain documentpreview-owned. */
export function registerOfficialFiles(ctx: ClientContext): void {
  const runtime = new OfficialFileRuntime()
  ctx.effect(() => ctx.sidebarRightTabs.register(officialFileDefinition(runtime)), 'dsh-better-sidebar: explicit folder tree')

  const store = createOfficialFilesStore()
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: OFFICIAL_FILE_ID, locale: LOCALE_NS, store,
    inject: officialFileFace(ctx, runtime), children: { 'sidebar.right.file.viewer': { kind: 'keyed', scope: 'session' } },
  }, OfficialEditorHost)), 'dsh-better-sidebar: explicit folder tree body')

  ctx.effect(
    () => ctx.documentEditors.register({ id: OFFICIAL_EDITOR_ID, documentIds: officialBuiltinViewers() }),
    'dsh-better-sidebar: official document editor metadata',
  )
  const editorInject = (): DocumentSourceEditorInjected => ({
    writeFile: (sessionId, path, content) => api.fsWrite({ sessionId }, path, content).then(() => undefined),
    insertText: (sessionId, text) => { appendToDraft(ctx as never, sessionId, text) },
  })
  for (const key of OFFICIAL_EDITOR_DOCUMENT_IDS) {
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.editor', () => ctx.slots.register({
      name: 'sidebar.right.tab.document.editor', key, locale: LOCALE_NS, inject: editorInject,
    }, DocumentSourceEditor)), `dsh-better-sidebar: official ${key} editor`)
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.settings', () => ctx.slots.register({
    name: 'sidebar.right.tab.settings', key: OFFICIAL_FILE_ID, locale: LOCALE_NS,
    inject: (): OfficialOpenWithInjected => ({
      hooks: { openWithPreferences: ctx.sidebarRightPreferences },
      setPluginSetting: (settingsId, key, value) => ctx.sidebarRightPreferences.setPluginSetting(settingsId, key, value),
    }),
  }, OfficialOpenWithSettings)), 'dsh-better-sidebar: explicit folder tree settings')
}
