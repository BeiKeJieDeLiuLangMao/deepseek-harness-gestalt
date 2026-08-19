/**
 * Settings section for Workspace Reference enable, paste ignore, and
 * basename filters. Copy never says "File mentions".
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createWorkspaceReferenceStore } from './settings-store.ts'
import type { WorkspaceReferenceSettings } from '../settings.ts'
import css from './SettingsSection.module.css'

/** Injected writes for the durable section. */
export interface WorkspaceReferenceSettingsInjected {
  /** Persist one field. */
  setField: (field: keyof WorkspaceReferenceSettings, value: boolean | string) => void
}

/** Full settings section props. */
export type WorkspaceReferenceSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsStore<ReturnType<typeof createWorkspaceReferenceStore>>
  & PropsLocale<'workspace-reference'>
  & WorkspaceReferenceSettingsInjected

/**
 * Render the Workspace Reference settings section.
 * @param props - composed slot props.
 */
export function WorkspaceReferenceSettingsSection({
  t, useStore, setField,
}: WorkspaceReferenceSettingsProps) {
  const enable = useStore(s => s.enable)
  const pasteIgnore = useStore(s => s.pasteIgnore)
  const exact = useStore(s => s.exact)
  const regex = useStore(s => s.regex)
  return (
    <section className={css.section} data-workspace-reference-settings>
      <label className={css.row}>
        <input
          type="checkbox"
          checked={enable}
          onChange={(event) => { setField('enable', event.target.checked) }}
        />
        {t('settings.enable')}
      </label>
      <label className={css.row}>
        <input
          type="checkbox"
          checked={pasteIgnore}
          onChange={(event) => { setField('pasteIgnore', event.target.checked) }}
        />
        {t('settings.pasteIgnore')}
      </label>
      <label className={css.field}>
        {t('settings.exact')}
        <input
          type="text"
          value={exact}
          onChange={(event) => { setField('exact', event.target.value) }}
        />
      </label>
      <label className={css.field}>
        {t('settings.regex')}
        <input
          type="text"
          value={regex}
          onChange={(event) => { setField('regex', event.target.value) }}
        />
      </label>
    </section>
  )
}
