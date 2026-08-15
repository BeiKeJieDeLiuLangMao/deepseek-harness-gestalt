import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/**
 * Keep the Session-scoped download modal mounted in the Session Header so
 * `/export` can open it from any conversation view. The visible download
 * control lives in the Trajectory toolbar.
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the Session-scoped dialog host.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
