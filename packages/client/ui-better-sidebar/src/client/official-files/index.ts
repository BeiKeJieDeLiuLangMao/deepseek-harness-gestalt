/** Register Better file capabilities under the official Sidebar contracts. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { LOCALE_NS } from '../locales.ts'
import { OfficialEditorHost } from './OfficialEditorHost.tsx'
import { officialBuiltinViewers, officialFileDefinition, OFFICIAL_FILE_ID } from './definitions.ts'
import { officialFileFace } from './face.ts'
import { OfficialFileRuntime } from './runtime.ts'
import { OfficialOpenWithSettings, type OfficialOpenWithInjected } from './OpenWithSettings.tsx'
import { createOfficialFilesStore } from './store.ts'
import {
  OfficialBinaryViewer,
  OfficialImageViewer,
  OfficialPdfViewer,
  OfficialTextEditorViewer,
} from './viewers.tsx'
import type {} from './contract.ts'

/** Install the official file type, its viewer inventory, and keyed bodies. */
export function registerOfficialFiles(ctx: ClientContext): void {
  const runtime = new OfficialFileRuntime()
  ctx.effect(
    () => ctx.sidebarRightTabs.register(officialFileDefinition(runtime)),
    'dsh-better-sidebar: official file type',
  )
  for (const viewer of officialBuiltinViewers()) {
    ctx.effect(
      () => ctx.sidebarRightTabs.registerViewer(viewer),
      `dsh-better-sidebar: official ${viewer.id} viewer`,
    )
  }

  const store = createOfficialFilesStore()
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: OFFICIAL_FILE_ID,
    locale: LOCALE_NS,
    store,
    inject: officialFileFace(ctx, runtime),
    children: {
      'sidebar.right.file.viewer': { kind: 'keyed', scope: 'session' },
    },
  }, OfficialEditorHost)), 'dsh-better-sidebar: official file body')

  const viewers = [
    ['image', OfficialImageViewer],
    ['pdf', OfficialPdfViewer],
    ['markdown', OfficialTextEditorViewer],
    ['html', OfficialTextEditorViewer],
    ['code', OfficialTextEditorViewer],
    ['binary-download', OfficialBinaryViewer],
  ] as const
  for (const [key, component] of viewers) {
    ctx.effect(() => ctx.slots.inject('sidebar.right.file.viewer', () => ctx.slots.register({
      name: 'sidebar.right.file.viewer',
      key,
      locale: LOCALE_NS,
    }, component)), `dsh-better-sidebar: official ${key} viewer body`)
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.settings', () => ctx.slots.register({
    name: 'sidebar.right.tab.settings',
    key: OFFICIAL_FILE_ID,
    locale: LOCALE_NS,
    inject: (): OfficialOpenWithInjected => ({
      hooks: { openWithPreferences: ctx.sidebarRightPreferences },
      setPluginSetting: (settingsId, key, value) =>
        ctx.sidebarRightPreferences.setPluginSetting(settingsId, key, value),
    }),
  }, OfficialOpenWithSettings)), 'dsh-better-sidebar: official file settings')
}
