/** Mobile-owned Workspace/Session list chrome over JSON Session and Workspace views. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  conversationPresentationTranslate,
  type MobileConversationCopy,
  type MobileConversationLocale,
} from './mobile-conversation-copy.ts'

const UNGROUPED_KEY = ''

/** One Session row derived from Desktop JSON list state. */
export interface MobileSessionRow {
  readonly id: SessionId
  readonly title: string
  readonly blank: boolean
  readonly running: boolean
  readonly updatedAt: number
}

/** One Workspace or Ungrouped group of visible Sessions. */
export interface MobileSessionGroup {
  readonly key: string
  readonly workspaceId: string | undefined
  readonly label: string
  readonly sessions: readonly MobileSessionRow[]
}

/**
 * Group Sessions by Host Workspace membership. Ungrouped Sessions trail by recency.
 * Blank Sessions stay hidden unless they are the current Session. Subagent origins stay hidden.
 * @param sessions - Desktop Session list.
 * @param workspaces - Desktop Workspace list.
 * @param t - Mobile list copy.
 * @returns expanded groups for the phone list.
 */
export function expandedSessionGroups(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  t: MobileConversationCopy,
): readonly MobileSessionGroup[] {
  const accounted = new Set<SessionId>()
  const groups: MobileSessionGroup[] = []
  for (const workspace of workspaces) {
    const members: MobileSessionRow[] = []
    for (const id of workspace.sessionIds) {
      const summary = sessions.byId[id]
      if (summary === undefined) continue
      accounted.add(id)
      if (!sessionVisible(summary, sessions.current)) continue
      members.push(sessionRow(summary, t))
    }
    groups.push({
      key: workspace.workspaceId,
      workspaceId: workspace.workspaceId,
      label: workspace.title,
      sessions: members,
    })
  }
  const stray = sessions.ids
    .map(id => sessions.byId[id])
    .filter((summary): summary is SessionSummary => (
      summary !== undefined && !accounted.has(summary.id) && sessionVisible(summary, sessions.current)
    ))
    .sort(byRecency)
    .map(summary => sessionRow(summary, t))
  if (stray.length > 0) {
    groups.push({
      key: UNGROUPED_KEY,
      workspaceId: undefined,
      label: t('group.ungrouped'),
      sessions: stray,
    })
  }
  return groups
}

function sessionVisible(session: SessionSummary, current: SessionId | undefined): boolean {
  return session.origin !== 'subagent' && (!session.blank || session.id === current)
}

function sessionRow(session: SessionSummary, t: MobileConversationCopy): MobileSessionRow {
  return {
    id: session.id,
    title: session.blank ? t('session.new') : session.displayTitle,
    blank: session.blank,
    running: session.running,
    updatedAt: session.updatedAt,
  }
}

function byRecency(left: SessionSummary, right: SessionSummary): number {
  if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt
  return left.id < right.id ? -1 : 1
}

function timeLabel(updatedAt: number, now: number, t: MobileConversationCopy): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

/**
 * Bind Mobile list copy, including Workspace grouping labels and relative time.
 * @param locale - selected product locale.
 * @returns lookup used by MobileBrowse grouping chrome.
 */
export function workspacePresentationTranslate(locale: MobileConversationLocale): MobileConversationCopy {
  return conversationPresentationTranslate(locale)
}

/** Props for one grouped Session tree. */
export interface MobileSessionListProps {
  label: string
  nodes: readonly MobileSessionRow[]
  currentId?: SessionId | undefined
  now: number
  onOpen: (id: SessionId) => void
  t: MobileConversationCopy
}

/**
 * Render keyboard-focusable Session rows for one Workspace or Ungrouped group.
 * @param props - grouped rows, clock, and open action.
 * @returns a Session tree.
 */
export function MobileSessionList({
  label, nodes, currentId, now, onOpen, t,
}: MobileSessionListProps): ReactNode {
  const preferred = nodes.some(node => node.id === currentId) ? currentId : nodes[0]?.id
  const [focusId, setFocusId] = useState(preferred)
  const tree = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!nodes.some(node => node.id === focusId)) setFocusId(preferred)
  }, [focusId, nodes, preferred])
  const moveFocus = (index: number, direction: -1 | 1): void => {
    const target = Math.max(0, Math.min(nodes.length - 1, index + direction))
    const next = nodes[target]
    if (next === undefined) return
    setFocusId(next.id)
    const rows = tree.current?.querySelectorAll<HTMLElement>('[data-session-row]')
    rows?.[target]?.focus()
  }
  return (
    <div role="tree" aria-label={label} ref={tree}>
      {nodes.map((node, index) => (
        <div
          key={node.id}
          role="treeitem"
          aria-selected={node.id === currentId}
          tabIndex={node.id === focusId ? 0 : -1}
          data-session-row={node.id}
          onFocus={() => { setFocusId(node.id) }}
          onClick={() => { onOpen(node.id) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              moveFocus(index, event.key === 'ArrowUp' ? -1 : 1)
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(node.id)
            }
          }}
        >
          <span>{node.title}</span>
          {!node.blank && <span>{timeLabel(node.updatedAt, now, t)}</span>}
        </div>
      ))}
    </div>
  )
}
