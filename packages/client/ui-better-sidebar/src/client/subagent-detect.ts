/**
 * Pure subagent-membership helpers over the sessions list feed (structural
 * mirror world — no runtime imports). Used by the sidebar's auto-activation
 * effect and the Subagent page:
 *
 * - {@link directSubagentCount}: direct durable children of one session,
 * - {@link detectNewDirectSubagent}: the 0 → N transition that means "a new
 *   subagent just spawned under the current session" (the auto-open trigger),
 * - {@link countSubagentDescendants}: uninterrupted subagent-origin lineage
 *   totals (mirror of the official `indexSubagentDescendants` over the
 *   plugin's own summary rows).
 *
 * The lineage walks themselves ({@link isSideThreadSummary}, {@link
 * rootAncestor}, {@link countSubagentDescendants}) live in
 * ./subagent-lineage.ts — the single shared walk implementation — and are
 * re-exported below for their established import sites.
 */
import type {
  SidebarSessionList,
  SidebarSubagentCatalog,
} from '../context-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { countSubagentDescendants, isSideThreadSummary, rootAncestor } from './subagent-lineage.ts'
import { SIDE_LABEL_PREFIX } from '../sidechat-core.ts'
import type { SideThreadRef } from './state.ts'

export { countSubagentDescendants, isSideThreadSummary, rootAncestor }
export type { SubagentDescendantTotals } from './subagent-lineage.ts'

/** Workspace archive projection required before Side Chat restoration. */
export interface SideThreadArchiveSnapshot {
  phase: 'pending' | 'ready'
  archivedSessionIds: readonly SessionId[]
}

/** Count the direct subagent children of one session (durable `origin` rows). */
export function directSubagentCount(
  byId: SidebarSessionList['byId'],
  sessionId: SessionId,
): number {
  let count = 0
  for (const summary of Object.values(byId)) {
    if (summary.origin === 'subagent' && summary.parentId === sessionId
      && !isSideThreadSummary(summary)) count += 1
  }
  return count
}

/**
 * Collect every catalog branch (an entry with `hasChildren`) reachable from
 * the root — the set of catalogs the always-expanded topology consumes.
 * Cycles fail soft.
 */
export function collectBranchIds(
  catalogs: Readonly<Record<string, SidebarSubagentCatalog>>,
  rootId: string | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (parentId: string): void => {
    if (seen.has(parentId)) return
    seen.add(parentId)
    for (const entry of catalogs[parentId]?.entries ?? []) {
      if (entry.kind === 'child' && entry.hasChildren) {
        out.push(entry.id)
        visit(entry.id)
      }
    }
  }
  if (rootId !== undefined) visit(rootId)
  return out
}

/** List published, unarchived direct Side Chat children eligible for tab restoration. */
export function restorableSideThreads(
  sessions: Pick<SidebarSessionList, 'byId' | 'subagentsByParent'>,
  sessionId: SessionId,
  archive: SideThreadArchiveSnapshot,
): SideThreadRef[] {
  if (archive.phase !== 'ready') return []
  const archived = new Set(archive.archivedSessionIds)
  const catalogLabels = new Map<string, string>()
  for (const entry of sessions.subagentsByParent?.[sessionId]?.entries ?? []) {
    if (entry.kind === 'child' && entry.label !== undefined) {
      catalogLabels.set(entry.id, entry.label)
    }
  }
  const threads: SideThreadRef[] = []
  for (const summary of Object.values(sessions.byId)) {
    if (summary.origin !== 'subagent' || summary.parentId !== sessionId) continue
    if (summary.provisional === true || summary.blank !== false) continue
    const label = summary.displayTitle.startsWith(SIDE_LABEL_PREFIX)
      ? summary.displayTitle
      : catalogLabels.get(summary.id)
    if (label === undefined || !label.startsWith(SIDE_LABEL_PREFIX)) continue
    if (archived.has(summary.id)) continue
    threads.push({
      threadId: summary.id,
      title: label.slice(SIDE_LABEL_PREFIX.length),
    })
  }
  return threads
}

/**
 * Whether a new direct subagent appeared under `sessionId` between two
 * consecutive list snapshots (the count crossed 0 → >0). Switching to a
 * session that already has subagents yields `false` (its baseline starts at
 * the current count), so the auto-open never fights an existing layout.
 */
export function detectNewDirectSubagent(
  prev: SidebarSessionList,
  next: SidebarSessionList,
  sessionId: SessionId,
): boolean {
  return directSubagentCount(prev.byId, sessionId) === 0
    && directSubagentCount(next.byId, sessionId) > 0
}
