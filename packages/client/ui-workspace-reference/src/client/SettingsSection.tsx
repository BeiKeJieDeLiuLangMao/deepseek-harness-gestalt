/**
 * Settings section for Workspace Reference enable, paste ignore, and
 * basename filters. Copy never says "File mentions".
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WorkspaceReferenceSettings } from '../settings.ts'
import { invalidBasenameRegex } from './scan.ts'
import css from './SettingsSection.module.css'

/** Registration-side business face: live preferences + the durable write. */
export interface WorkspaceReferenceSettingsInjected {
  hooks: {
    /** Durable Workspace Reference preferences bound by the renderer as useSettings. */
    settings: SnapshotStore<WorkspaceReferenceSettings>
  }
  /** Persist one field. */
  setField: (field: keyof WorkspaceReferenceSettings, value: boolean | string) => void
}

/** Full settings section props. */
export type WorkspaceReferenceSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'workspace-reference'>
  & InjectFace<WorkspaceReferenceSettingsInjected>

/**
 * Render the Workspace Reference settings section.
 * @param props - composed slot props.
 */
export function WorkspaceReferenceSettingsSection({
  t, useSettings, setField,
}: WorkspaceReferenceSettingsProps) {
  const enable = useSettings(s => s.enable)
  const pasteIgnore = useSettings(s => s.pasteIgnore)
  const exact = useSettings(s => s.exact)
  const regex = useSettings(s => s.regex)
  const regexInvalid = invalidBasenameRegex(regex)
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
          disabled={!enable}
          onChange={(event) => { setField('pasteIgnore', event.target.checked) }}
        />
        {t('settings.pasteIgnore')}
      </label>
      <label className={css.field}>
        {t('settings.exact')}
        <input
          type="text"
          value={exact}
          disabled={!enable}
          onChange={(event) => { setField('exact', event.target.value) }}
        />
      </label>
      <div className={css.field}>
        <label>
          {t('settings.regex')}
          <input
            type="text"
            value={regex}
            disabled={!enable}
            aria-invalid={regexInvalid || undefined}
            aria-describedby={regexInvalid ? 'workspace-reference-regex-error' : undefined}
            onChange={(event) => { setField('regex', event.target.value) }}
          />
        </label>
        {regexInvalid
          ? (
            <p id="workspace-reference-regex-error" className={css.error} role="alert">
              {t('settings.regexInvalid')}
            </p>
          )
          : null}
      </div>
    </section>
  )
}
