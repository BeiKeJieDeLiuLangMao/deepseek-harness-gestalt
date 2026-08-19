/**
 * Composer dock listing `@path` tokens in the live draft. Open reveals the
 * path; Remove deletes that token from the draft.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { WorkspaceReferenceSettings } from '../settings.ts'
import { confinedDraftPath } from './confine.ts'
import { removeDraftMention, scanDraftMentions } from './scan.ts'
import type { WorkspaceReferenceKey } from './locales.ts'
import css from './Dock.module.css'

/** Registration-side business face: live preferences + the open verb. */
export interface WorkspaceReferenceDockInjected {
  hooks: {
    /** Durable Workspace Reference preferences bound by the renderer as useSettings. */
    settings: SnapshotStore<WorkspaceReferenceSettings>
  }
  /** Open one workspace-relative path in the Host. */
  openPath: (path: string) => void
}

/** Full dock props: input-zone owner + locale + inject face. */
export type WorkspaceReferenceDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'workspace-reference'>
  & InjectFace<WorkspaceReferenceDockInjected>

/**
 * Render referenced-path chips above the composer.
 * @param props - composed slot props.
 */
export function WorkspaceReferenceDock({
  input, inputActions, useSettings, t, openPath,
}: WorkspaceReferenceDockProps) {
  const enable = useSettings(s => s.enable)
  const paths = enable
    ? scanDraftMentions(input.draft).filter(path => confinedDraftPath(path) !== undefined)
    : []
  if (paths.length === 0) return null
  return (
    <div className={css.dock} data-workspace-reference-dock>
      {paths.map(path => (
        <div key={path} className={css.chip} data-workspace-reference-chip={path}>
          <button
            type="button"
            className={css.path}
            aria-label={t('dock.open' satisfies WorkspaceReferenceKey)}
            onClick={() => { openPath(path) }}
          >
            {path}
          </button>
          <button
            type="button"
            className={css.remove}
            aria-label={t('dock.remove' satisfies WorkspaceReferenceKey)}
            onClick={() => { inputActions.setDraft(removeDraftMention(input.draft, path)) }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
