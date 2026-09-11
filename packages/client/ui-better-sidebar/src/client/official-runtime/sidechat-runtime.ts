/** Occurrence-owned Side Chat admission, restoration, and true-close lifecycle. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  SidebarRightProjection, SidebarRightTabCloseContext,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SidebarContext, SidebarSessionList, SidebarSessionSummary, SidebarSubagentAddress,
} from '../../context-types.ts'
import { SIDE_LABEL_PREFIX, SIDE_NEW_THREAD_TITLE } from '../../sidechat-core.ts'
import {
  api, noteKnownSidechatSession, registerSidechatDraft,
} from '../api.ts'
import { t } from '../locales.ts'
import { restorableSideThreads } from '../subagent-detect.ts'
import {
  OFFICIAL_SIDECHAT_KIND, officialSidechatPayloadOf, restoreOfficialSidechatPayload,
  type OfficialSidechatPayload,
} from './payload.ts'

/** Session extension-data key retaining user-closed Side Chat roots. */
export const OFFICIAL_SIDECHAT_TOMBSTONES = '@deepseek-ai/dsh-client-ui-better-sidebar/sidechat-tombstones'

/** Client services required by the Side Chat occurrence owner. */
export type OfficialSidechatContext = SidebarContext & Pick<ClientContext, 'sidebarRight'>

type OfficialTabId = SidebarRightTabCloseContext['tab']['id']

interface SidechatOccurrence {
  readonly sessionId: SessionId
  readonly tabId: OfficialTabId
  payload: OfficialSidechatPayload
  draft?: {
    readonly rootThreadId: string
    readonly dispose: () => void
  }
}

function occurrenceKey(sessionId: SessionId, tabId: OfficialTabId): string {
  return `${sessionId}\u0000${tabId}`
}

function titleOf(displayTitle: string): string {
  if (displayTitle === SIDE_NEW_THREAD_TITLE) return t('sideChatUntitled')
  return displayTitle.startsWith(SIDE_LABEL_PREFIX)
    ? displayTitle.slice(SIDE_LABEL_PREFIX.length)
    : displayTitle
}

function catalogLabel(sessions: SidebarSessionList, parentSessionId: string, childSessionId: string): string | undefined {
  for (const entry of sessions.subagentsByParent?.[parentSessionId]?.entries ?? []) {
    if (entry.kind === 'child' && entry.id === childSessionId) return entry.label
  }
  return undefined
}

function durableSideLabel(summary: SidebarSessionSummary | undefined, catalog: string | undefined): string | undefined {
  if (summary?.title?.startsWith(SIDE_LABEL_PREFIX) === true) return summary.title
  if (catalog?.startsWith(SIDE_LABEL_PREFIX) === true) return catalog
  if (summary?.displayTitle.startsWith(SIDE_LABEL_PREFIX) === true) return summary.displayTitle
  return undefined
}

/**
 * Open or focus the official Side Chat occurrence for one catalog child.
 * @param ctx - official workbench and Session projection.
 * @param address - catalog-derived parent and child ids.
 * @returns whether the child is a Side Chat and the shell Session must stay put.
 */
export function openOfficialSidechatFromCatalog(
  ctx: OfficialSidechatContext,
  address: SidebarSubagentAddress,
): boolean {
  const sessions = ctx.sessions.list.getSnapshot()
  const summary = sessions.byId[address.childSessionId]
  const label = durableSideLabel(summary, catalogLabel(sessions, address.parentSessionId, address.childSessionId))
  if (label === undefined) return false
  const threadId = SessionId(address.childSessionId)
  const parentSessionId = SessionId(address.parentSessionId)
  noteKnownSidechatSession(threadId)
  void ctx.sidebarRight.forSession(parentSessionId).openTab(OFFICIAL_SIDECHAT_KIND, {
    instanceId: threadId,
    title: titleOf(label),
    payload: restoreOfficialSidechatPayload(threadId),
  }).catch((error: unknown) => {
    console.error('[dsh-better-sidebar] open Side Chat from catalog failed:', error)
  })
  return true
}

/**
 * Divert catalog and list selection of a `Side: ` child onto its official tab.
 * Ordinary subagent rows keep stock Session selection.
 * @param sessions - Client Sessions service on the live context.
 * @param ctx - official workbench used to open or focus the matching tab.
 * @returns a disposer that restores the original methods.
 */
export function interceptOfficialSidechatCatalogOpen(
  sessions: Pick<OfficialSidechatContext['sessions'], 'open' | 'openSubagent'>,
  ctx: OfficialSidechatContext,
): () => void {
  const originalOpen = sessions.open
  const originalOpenSubagent = sessions.openSubagent
  if (originalOpenSubagent !== undefined) {
    const openSubagent = originalOpenSubagent.bind(sessions)
    sessions.openSubagent = (address) => {
      if (!openOfficialSidechatFromCatalog(ctx, address)) openSubagent(address)
    }
  }
  if (originalOpen !== undefined) {
    const open = originalOpen.bind(sessions)
    sessions.open = (id) => {
      const sessionsSnapshot = ctx.sessions.list.getSnapshot()
      const summary = sessionsSnapshot.byId[id]
      const parentId = summary?.parentId
      if (parentId !== undefined && openOfficialSidechatFromCatalog(ctx, {
        parentSessionId: parentId,
        childSessionId: id,
        mode: 'continuable',
      })) return
      open(id)
    }
  }
  return () => {
    sessions.open = originalOpen
    sessions.openSubagent = originalOpenSubagent
  }
}

/**
 * Read the tombstone list from official Session extension data.
 * @param value - persisted JSON at {@link OFFICIAL_SIDECHAT_TOMBSTONES}.
 * @returns unique non-empty Session ids in their stored order.
 */
export function officialSidechatTombstonesOf(value: unknown): SessionId[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: SessionId[] = []
  for (const candidate of value) {
    if (typeof candidate === 'string' && candidate !== '' && !seen.has(candidate)) {
      seen.add(candidate)
      out.push(SessionId(candidate))
    }
  }
  return out
}

function projectionSession(projection: SidebarRightProjection, sessionId: SessionId) {
  return projection.sessions.find(session => session.sessionId === sessionId)
}

/**
 * True-close hook for an official Side Chat occurrence.
 *
 * The Host settles any first publication and releases its Agent before the
 * Session is archived. The tombstone is committed only after both operations
 * succeed, so a rejected close leaves the occurrence and restoration policy
 * unchanged. The official close coordinator then removes the record.
 * @param ctx - client services for Host release, archival, and official state.
 * @param close - occurrence facts fixed before the asynchronous close starts.
 */
export async function closeOfficialSidechat(
  ctx: OfficialSidechatContext,
  close: SidebarRightTabCloseContext,
): Promise<void> {
  const payload = officialSidechatPayloadOf(close.payload)
  if (payload === undefined) return
  const rootThreadId = SessionId(payload.rootThreadId)
  const { published } = await api.sidechatDispose(rootThreadId)
  if (published) await ctx.workspaces.archiveSession(rootThreadId)

  const session = projectionSession(ctx.sidebarRight.getSnapshot(), close.sessionId)
  const tombstones = officialSidechatTombstonesOf(session?.data[OFFICIAL_SIDECHAT_TOMBSTONES])
  if (!tombstones.includes(rootThreadId)) {
    ctx.sidebarRight.forSession(close.sessionId).setData(
      OFFICIAL_SIDECHAT_TOMBSTONES,
      [...tombstones, rootThreadId],
    )
  }
}

/**
 * Bind Side Chat draft ownership and cold restoration to official occurrences.
 * @param ctx - official workbench, Session projection, renderer, and archival services.
 * @returns a disposer for projection subscriptions and provisional identities.
 */
export function subscribeOfficialSidechatRuntime(ctx: OfficialSidechatContext): () => void {
  const occurrences = new Map<string, SidechatOccurrence>()
  const restoring = new Set<string>()
  let disposed = false
  let syncing = false
  let syncAgain = false

  const stopDraft = (occurrence: SidechatOccurrence): void => {
    occurrence.draft?.dispose()
    occurrence.draft = undefined
  }

  const startDraft = (occurrence: SidechatOccurrence): void => {
    if (occurrence.draft?.rootThreadId === occurrence.payload.rootThreadId) return
    stopDraft(occurrence)
    const rootThreadId = SessionId(occurrence.payload.rootThreadId)
    const forgetDraft = registerSidechatDraft(rootThreadId, occurrence.sessionId)
    const unstage = ctx.sessions.stageProvisional({
      sessionId: rootThreadId,
      parentSessionId: occurrence.sessionId,
      origin: 'subagent',
      title: SIDE_NEW_THREAD_TITLE,
    })
    occurrence.draft = {
      rootThreadId,
      dispose: () => {
        unstage()
        forgetDraft()
      },
    }
  }

  const syncOccurrences = (
    projection: SidebarRightProjection,
    sessions: SidebarSessionList,
  ): void => {
    const seen = new Set<string>()
    for (const session of projection.sessions) {
      for (const tab of session.tabs) {
        if (tab.record.kind !== OFFICIAL_SIDECHAT_KIND) continue
        const payload = officialSidechatPayloadOf(tab.state.payload)
        if (payload === undefined) continue
        const key = occurrenceKey(session.sessionId, tab.record.id)
        seen.add(key)
        let occurrence = occurrences.get(key)
        if (occurrence === undefined) {
          occurrence = { sessionId: session.sessionId, tabId: tab.record.id, payload }
          occurrences.set(key, occurrence)
        } else {
          occurrence.payload = payload
        }
        noteKnownSidechatSession(SessionId(payload.rootThreadId))
        noteKnownSidechatSession(SessionId(payload.threadId))

        const rootSummary = sessions.byId[payload.rootThreadId]
        if (payload.provisional === true && rootSummary?.blank === false) {
          stopDraft(occurrence)
          const next: OfficialSidechatPayload = {
            rootThreadId: payload.rootThreadId,
            threadId: payload.threadId,
          }
          ctx.sidebarRight.forSession(session.sessionId).update(tab.record.id, { payload: next })
          occurrence.payload = next
        } else if (payload.provisional === true) {
          startDraft(occurrence)
        } else {
          stopDraft(occurrence)
        }

        const summary = sessions.byId[payload.threadId]
        if (summary?.blank === false) {
          const title = titleOf(summary.displayTitle)
          if (title !== '' && title !== tab.record.title) {
            ctx.sidebarRight.forSession(session.sessionId).update(tab.record.id, { title })
          }
        }
      }
    }
    for (const [key, occurrence] of occurrences) {
      if (seen.has(key)) continue
      stopDraft(occurrence)
      occurrences.delete(key)
    }
  }

  const restore = (projection: SidebarRightProjection, sessions: SidebarSessionList): void => {
    const sessionId = sessions.current
    if (sessionId === undefined) return
    const projectionForSession = projectionSession(projection, sessionId)
    const tombstones = new Set(officialSidechatTombstonesOf(
      projectionForSession?.data[OFFICIAL_SIDECHAT_TOMBSTONES],
    ))
    const openedRoots = new Set(
      (projectionForSession?.tabs ?? [])
        .filter(tab => tab.record.kind === OFFICIAL_SIDECHAT_KIND)
        .map(tab => officialSidechatPayloadOf(tab.state.payload)?.rootThreadId)
        .filter((root): root is string => root !== undefined),
    )
    const threads = restorableSideThreads(
      sessions,
      sessionId,
      ctx.workspaces.list.getSnapshot(),
    )
    for (const thread of threads) {
      if (tombstones.has(thread.threadId) || openedRoots.has(thread.threadId)) continue
      const key = `${sessionId}\u0000${thread.threadId}`
      if (restoring.has(key)) continue
      restoring.add(key)
      void ctx.sidebarRight.forSession(sessionId).openTab(OFFICIAL_SIDECHAT_KIND, {
        instanceId: thread.threadId,
        title: thread.title,
        payload: restoreOfficialSidechatPayload(thread.threadId),
        // Cold discovery must retain the user's selected tab and collapsed state.
        activate: false,
      }).catch((error: unknown) => {
        console.error('[dsh-better-sidebar] Side Chat restoration failed:', error)
      }).finally(() => { restoring.delete(key) })
    }
  }

  const sync = (): void => {
    if (disposed) return
    if (syncing) {
      syncAgain = true
      return
    }
    syncing = true
    try {
      do {
        syncAgain = false
        const projection = ctx.sidebarRight.getSnapshot()
        const sessions = ctx.sessions.list.getSnapshot()
        syncOccurrences(projection, sessions)
        restore(projection, sessions)
      } while (syncAgain)
    } finally {
      syncing = false
    }
  }

  const unsubscribeSidebar = ctx.sidebarRight.subscribe(sync)
  const unsubscribeSessions = ctx.sessions.list.subscribe(sync)
  const unsubscribeWorkspaces = ctx.workspaces.list.subscribe(sync)
  sync()
  return () => {
    disposed = true
    unsubscribeWorkspaces()
    unsubscribeSessions()
    unsubscribeSidebar()
    for (const occurrence of occurrences.values()) stopDraft(occurrence)
    occurrences.clear()
  }
}
