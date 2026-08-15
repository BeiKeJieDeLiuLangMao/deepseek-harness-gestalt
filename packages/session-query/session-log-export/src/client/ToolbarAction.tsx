import type { ReactNode } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { NS } from './locales.ts'
import type { SessionLogDownloadDialogInjected } from './Dialog.tsx'
import css from './ToolbarAction.module.css'

export type SessionLogDownloadToolbarActionProps =
  PropsRuntime<'conversation.trajectory.toolbar.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<SessionLogDownloadDialogInjected>

/**
 * Render the Trajectory toolbar Session-log download capsule.
 * @param props - Session runtime and download controller.
 * @returns the toolbar download button.
 */
export function SessionLogDownloadToolbarAction({
  sessionId, useSessionLogDownload, request, t,
}: SessionLogDownloadToolbarActionProps): ReactNode {
  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
  const busy = entry?.status === 'downloading'
  const label = t('toolbar.download')

  return (
    <button
      type="button"
      className={css.sessionLogButton}
      aria-label={label}
      disabled={busy}
      aria-busy={busy}
      onClick={() => { void request(sessionId) }}
    >
      <span>{label}</span>
      <IconDownloadOutline16 size={12} />
    </button>
  )
}
