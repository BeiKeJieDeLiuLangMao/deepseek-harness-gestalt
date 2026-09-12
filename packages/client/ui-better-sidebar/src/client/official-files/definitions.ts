/** Better tree and editor metadata contributed through official Sidebar contracts. */
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DocumentEditorDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { t } from '../locales.ts'
import { officialFileTitle, parseOfficialFileAddress } from './address.ts'
import type { OfficialFileRuntime } from './runtime.ts'

/** Better's explicit folder-tab identity; it claims no file address automatically. */
export const OFFICIAL_FILE_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/file'
/** Explicit folder-tab kind used only by folder/reveal routing. */
export const OFFICIAL_FILE_KIND = 'file'
/** Registration identity shared by the renderer-specific editor bodies. */
export const OFFICIAL_EDITOR_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/editor'

/** Renderer ids whose complete text the Better editor can safely modify. */
export const OFFICIAL_EDITOR_DOCUMENT_IDS = [
  '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text',
  '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
  '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code',
] as const

/** Explicit tree tab; no patterns means ordinary file addresses stay with documentpreview. */
export function officialFileDefinition(runtime: OfficialFileRuntime): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_FILE_ID,
    kind: OFFICIAL_FILE_KIND,
    hidden: true,
    canOpen: address => parseOfficialFileAddress(address)?.scope === 'session',
    title: officialFileTitle,
    settings: officialFolderSettings(),
    beforeClose: context => runtime.beforeClose(context),
    close: context => { runtime.release(context) },
  }
}

/** @returns renderer ids claimed by Better's editor metadata. */
export function officialBuiltinViewers(): DocumentEditorDefinition['documentIds'] {
  return OFFICIAL_EDITOR_DOCUMENT_IDS
}

/** Folder settings retained on the explicit Better tree tab. */
export function officialFolderSettings(): SidebarRightTabDefinition['settings'] {
  return {
    settingsId: 'editor',
    fields: [{
      key: 'editorExplorer', source: 'preference', control: 'select', title: () => t('editorExplorer'), description: () => t('editorExplorerDesc'),
      options: [
        { value: true, title: () => t('editorExplorerMerged'), description: () => t('editorExplorerMergedDesc') },
        { value: false, title: () => t('editorExplorerSplit'), description: () => t('editorExplorerSplitDesc') },
      ],
    }, {
      key: 'workspaceFence', source: 'preference', control: 'switch', title: () => t('settingsFenceTitle'), description: () => t('settingsFenceDesc'), unsafe: true,
    }],
    custom: true,
  }
}
