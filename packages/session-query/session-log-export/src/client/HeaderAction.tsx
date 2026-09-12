import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/**
 * Host the shared Session-log download dialog in the Session Header utilities
 * hole. The visible Trajectory toolbar capsule is a separate contribution.
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the Session-scoped dialog.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
