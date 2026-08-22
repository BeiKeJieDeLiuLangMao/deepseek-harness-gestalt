/** Companion Session list projection shared by Mobile browse and keyless equality proofs. */

import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { requireCompanionMutation, type CompanionConnectionState } from './companion-mutation.ts'

/** One Session row in the Mobile Companion list. */
export interface CompanionSessionSummary {
  /** Opaque Session identity. */
  id: string
  /** Desktop-confirmed title. */
  title: string
  /** Optional Workspace name. */
  workspace?: string
  /** Optional project name inside a Workspace. */
  project?: string
  /** Hidden-session summary text. */
  summary: string
  /** Desktop-authoritative open Session projection. */
  conversation?: ConversationSnapshot
  /** Desktop-confirmed Session Workspace root. */
  cwd?: string
}

/** Grouped Mobile list: named Workspace/project buckets plus Ungrouped. */
export interface CompanionSessionGroups {
  /** Workspace or project groups in first-seen order. */
  groups: readonly { name: string; sessions: readonly CompanionSessionSummary[] }[]
  /** Sessions without a Workspace or project. */
  ungrouped: readonly CompanionSessionSummary[]
}

/** Default history page ceiling for phone-sized paging. */
export const COMPANION_HISTORY_PAGE_SIZE = 20

/**
 * Group Sessions by Workspace/project, leaving unlabeled rows in Ungrouped.
 * @param sessions - Desktop-confirmed Session rows.
 * @returns named groups plus Ungrouped.
 */
export function groupCompanionSessions(sessions: readonly CompanionSessionSummary[]): CompanionSessionGroups {
  const groups = new Map<string, CompanionSessionSummary[]>()
  const ungrouped: CompanionSessionSummary[] = []
  for (const session of sessions) {
    const name = session.workspace ?? session.project
    if (name === undefined || name === '') {
      ungrouped.push(session)
      continue
    }
    const bucket = groups.get(name) ?? []
    bucket.push(session)
    groups.set(name, bucket)
  }
  return {
    groups: [...groups].map(([name, rows]) => ({ name, sessions: rows })),
    ungrouped,
  }
}

/**
 * Page a history list with an explicit ceiling; extra rows spill.
 * @param sessions - ordered history.
 * @param page - zero-based page.
 * @param ceiling - maximum visible rows per page.
 * @returns visible rows and the count that spilled past the ceiling.
 */
export function pageCompanionHistory(
  sessions: readonly CompanionSessionSummary[],
  page: number,
  ceiling: number = COMPANION_HISTORY_PAGE_SIZE,
): { visible: readonly CompanionSessionSummary[]; spilled: number } {
  if (!Number.isSafeInteger(page) || page < 0) throw new TypeError('Companion history page must be a non-negative integer')
  if (!Number.isSafeInteger(ceiling) || ceiling <= 0) throw new TypeError('Companion history ceiling must be a positive integer')
  const start = page * ceiling
  const visible = sessions.slice(start, start + ceiling)
  const remaining = Math.max(0, sessions.length - start - visible.length)
  return { visible, spilled: remaining }
}

/**
 * Project Desktop-confirmed history into the Mobile list without inventing rows.
 * @param desktopConfirmed - authoritative Desktop history.
 * @returns a Mobile-safe copy used for equality proofs.
 */
export function projectMobileCompanionHistory(
  desktopConfirmed: readonly CompanionSessionSummary[],
): readonly CompanionSessionSummary[] {
  return desktopConfirmed.map(session => ({
    id: session.id,
    title: session.title,
    ...(session.workspace === undefined ? {} : { workspace: session.workspace }),
    ...(session.project === undefined ? {} : { project: session.project }),
    summary: session.summary,
    ...(session.conversation === undefined ? {} : { conversation: session.conversation }),
    ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
  }))
}

/** Production composition accepted by the bundled Mobile entry. */
export interface MobileCompanionPresentation {
  /** Selected Paired Desktop name. */
  desktopName: string
  /** Desktop reachability at the latest foreground synchronization. */
  connection: 'online' | 'offline'
  /** Desktop-confirmed Session history. */
  sessions: readonly CompanionSessionSummary[]
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

/** Request to create one Desktop-default Session from Mobile. */
export interface CreateCompanionSessionInput {
  /** Idempotency key attributed to the Device Principal. */
  operationId: string
  /** Session title using Desktop defaults. */
  title: string
  /** Target Workspace; omit for Ungrouped. */
  workspace?: string
  /** Device Principal that requested the create. */
  devicePrincipalId: string
}

/**
 * Append one created Session unless this operation id already committed.
 * @param sessions - current Desktop-confirmed list.
 * @param committed - previously applied operation ids.
 * @param input - create request.
 * @param connection - foreground connection and validated synchronization state.
 * @returns next list and whether a new row was appended.
 */
export function createCompanionSession(
  sessions: readonly CompanionSessionSummary[],
  committed: ReadonlySet<string>,
  input: CreateCompanionSessionInput,
  connection: CompanionConnectionState | undefined,
): { sessions: readonly CompanionSessionSummary[]; created: boolean } {
  requireCompanionMutation(connection, 'session-create')
  if (input.operationId === '') throw new TypeError('Companion create operation id must be non-empty')
  if (committed.has(input.operationId)) return { sessions, created: false }
  const created: CompanionSessionSummary = {
    id: input.operationId,
    title: input.title,
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    summary: 'New Session',
  }
  return { sessions: [...sessions, created], created: true }
}
