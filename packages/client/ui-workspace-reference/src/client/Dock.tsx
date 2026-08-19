/**
 * Composer dock listing `@path` tokens in the live draft. Open reveals the
 * path; Remove deletes that token from the draft.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createWorkspaceReferenceStore } from './settings-store.ts'
import { removeDraftMention, scanDraftMentions } from './scan.ts'
import type { WorkspaceReferenceKey } from './locales.ts'
import css from './Dock.module.css'

/** Injected verbs for opening a workspace path. */
export interface WorkspaceReferenceDockInjected {
  /** Open one workspace-relative path in the Host. */
  openPath: (path: string) => void
}

/** Full dock props: input-zone owner + settings store + locale + inject. */
export type WorkspaceReferenceDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsStore<ReturnType<typeof createWorkspaceReferenceStore>>
  & PropsLocale<'workspace-reference'>
  & WorkspaceReferenceDockInjected

/**
 * Render referenced-path chips above the composer.
 * @param props - composed slot props.
 */
export function WorkspaceReferenceDock({
  input, inputActions, useStore, t, openPath,
}: WorkspaceReferenceDockProps) {
  const enable = useStore(s => s.enable)
  const paths = enable ? scanDraftMentions(input.draft) : []
  if (paths.length === 0) return null
  return (
    <div className={css.dock} data-workspace-reference-dock>
      {paths.map(path => (
        <div key={path} className={css.chip} data-workspace-reference-chip={path}>
          <button type="button" className={css.path} onClick={() => { openPath(path) }}>
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
