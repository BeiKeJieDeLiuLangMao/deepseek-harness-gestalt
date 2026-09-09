/** Static official file tab and built-in viewer definitions. */
import type {
  SidebarRightTabDefinition,
  SidebarRightViewerDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { t } from '../locales.ts'
import { officialFileTitle, parseOfficialFileAddress } from './address.ts'
import type { OfficialFileRuntime } from './runtime.ts'

/** Official file tab kind. */
export const OFFICIAL_FILE_KIND = 'file'

/** Registration identity and keyed body seat of the official file tab. */
export const OFFICIAL_FILE_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/file'

/** Built-in file type registered over the plain-text fallback. */
export function officialFileDefinition(runtime: OfficialFileRuntime): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_FILE_ID,
    kind: OFFICIAL_FILE_KIND,
    patterns: ['dsh-resource://file/**'],
    priority: 'builtin',
    canOpen: address => parseOfficialFileAddress(address)?.scope === 'session',
    title: officialFileTitle,
    settings: {
      settingsId: 'editor',
      fields: [{
        key: 'editorExplorer',
        source: 'preference',
        control: 'select',
        title: () => t('editorExplorer'),
        description: () => t('editorExplorerDesc'),
        options: [{
          value: true,
          title: () => t('editorExplorerMerged'),
          description: () => t('editorExplorerMergedDesc'),
        }, {
          value: false,
          title: () => t('editorExplorerSplit'),
          description: () => t('editorExplorerSplitDesc'),
        }],
      }, {
        key: 'workspaceFence',
        source: 'preference',
        control: 'switch',
        title: () => t('settingsFenceTitle'),
        description: () => t('settingsFenceDesc'),
        unsafe: true,
      }],
      custom: true,
    },
    beforeClose: context => runtime.beforeClose(context),
    close: context => { runtime.release(context) },
  }
}

/** Six viewers shipped by the official file host. */
export function officialBuiltinViewers(): readonly SidebarRightViewerDefinition[] {
  return [
    {
      id: 'image',
      title: () => t('viewerImage'),
      icon: 'image',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
      fetchStrategy: 'mediaUrl',
    },
    {
      id: 'pdf',
      title: () => t('viewerPdf'),
      icon: 'pdf',
      extensions: ['pdf'],
      fetchStrategy: 'mediaUrl',
    },
    {
      id: 'markdown',
      title: () => t('viewerMarkdown'),
      icon: 'markdown',
      extensions: ['md', 'markdown'],
      fetchStrategy: 'fsRead',
    },
    {
      id: 'html',
      title: () => t('viewerHtml'),
      icon: 'html',
      extensions: ['html', 'htm'],
      fetchStrategy: 'fsRead',
      settings: {
        fields: [{
          key: 'htmlViewerNoSandbox',
          source: 'preference',
          control: 'switch',
          title: () => t('settingsHtmlSandboxTitle'),
          description: () => t('settingsHtmlSandboxDesc'),
          unsafe: true,
        }, {
          key: 'htmlViewerDefaultUnsafe',
          source: 'preference',
          control: 'switch',
          title: () => t('settingsHtmlDefaultUnsafeTitle'),
          description: () => t('settingsHtmlDefaultUnsafeDesc'),
          unsafe: true,
        }],
      },
    },
    {
      id: 'code',
      title: () => t('viewerCode'),
      icon: 'code',
      extensions: [],
      priority: -100,
      fetchStrategy: 'fsRead',
    },
    {
      id: 'binary-download',
      title: () => t('viewerBinary'),
      icon: 'download',
      extensions: ['doc', 'xls', 'ppt'],
      priority: -50,
      fetchStrategy: 'binary-download',
      detect: ({ head }) => head?.includes(0) === true,
    },
  ]
}
