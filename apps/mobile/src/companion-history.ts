/** Mobile composition over Desktop-owned Session list and conversation projections. */

import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** Default history page ceiling for phone-sized paging. */
export const COMPANION_HISTORY_PAGE_SIZE = 20

/** Desktop-authoritative conversations keyed by the same Session ids as the list projection. */
export type CompanionConversationMap = Readonly<Partial<Record<SessionId, ConversationSnapshot>>>

/** Production composition accepted by the bundled Mobile entry. */
export interface MobileCompanionPresentation {
  /** Selected Paired Desktop name. */
  desktopName: string
  /** Desktop reachability at the latest foreground synchronization. */
  connection: 'online' | 'offline'
  /** Exact Desktop Session list projection. */
  sessions: SessionListState
  /** Exact Desktop Workspace list used by the shared grouping owner. */
  workspaces: readonly WorkspaceView[]
  /** Opened Desktop conversation projections keyed by Session id. */
  conversations: CompanionConversationMap
  /** Read one authorized historical image from the selected Session. */
  loadImage: (sessionId: string, attachment: ImageAttachmentRef) => Promise<string>
  /** Whether current foreground synchronization admits mutation controls. */
  canMutate: boolean
  /** Create one Desktop-default Session when mutation authority is available. */
  onCreate?: ((input: { workspace?: string }) => void) | undefined
  /** Submit a prompt through Desktop authority when transport is available. */
  onSubmit?: ((sessionId: string, text: string) => void | Promise<void>) | undefined
  /** Cancel a running Desktop Session when transport is available. */
  onCancel?: ((sessionId: string) => void) | undefined
  /** Load the preceding authoritative history window. */
  onLoadOlder?: ((sessionId: string) => void) | undefined
}

/** Page an exact Desktop Session list without projecting another row model. */
export function pageCompanionHistory(
  sessions: SessionListState,
  page: number,
  ceiling: number = COMPANION_HISTORY_PAGE_SIZE,
): { visible: SessionListState; spilled: number } {
  if (!Number.isSafeInteger(page) || page < 0) throw new TypeError('Companion history page must be a non-negative integer')
  if (!Number.isSafeInteger(ceiling) || ceiling <= 0) throw new TypeError('Companion history ceiling must be a positive integer')
  const end = (page + 1) * ceiling
  return {
    visible: { ...sessions, ids: sessions.ids.slice(0, end) },
    spilled: Math.max(0, sessions.ids.length - end),
  }
}
