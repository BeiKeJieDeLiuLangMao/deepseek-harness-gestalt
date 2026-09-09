/** Official descriptor settings adapter for the file tree's open-with editor. */
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SidebarRightPreferencesSnapshot } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { OpenWithSettings } from '../open-with-settings.tsx'
import { parseOpenWithConfig } from '../open-with.ts'

/** Settings face supplied by the official preferences owner. */
export interface OfficialOpenWithInjected {
  readonly hooks: { readonly openWithPreferences: HostObservable<SidebarRightPreferencesSnapshot> }
  readonly setPluginSetting: (settingsId: string, key: string, value: JsonValue) => Promise<void>
}

type OfficialOpenWithSettingsProps =
  & PropsRuntime<'sidebar.right.tab.settings'>
  & InjectFace<OfficialOpenWithInjected>
  & PropsLocale<'betterSidebar'>

/** Open-with custom editor persisted under the retained `editor` settings blob. */
export function OfficialOpenWithSettings({
  settingsId, useOpenWithPreferences, setPluginSetting,
}: OfficialOpenWithSettingsProps): ReactNode {
  const settings = useOpenWithPreferences(snapshot => snapshot.preferences.pluginSettings[settingsId] ?? {})
  return (
    <OpenWithSettings
      pluginSettings={settings}
      updatePluginSetting={(_key, value) => {
        const parsed = parseOpenWithConfig(value)
        void setPluginSetting(settingsId, 'openWith', {
          sshHost: parsed.sshHost,
          customEditors: parsed.customEditors.map(editor => ({
            id: editor.id,
            name: editor.name,
            urlTemplate: editor.urlTemplate,
            isVscodeFamily: editor.isVscodeFamily,
          })),
          pinned: parsed.pinned,
        })
      }}
    />
  )
}
