/** Side Chat tab shell over the canonical explicit-Session conversation renderer. */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionId as SessionIdType } from '@deepseek-ai/dsh-api-remotes/client'
import type { SidebarContext } from '../context-types.ts'
import {
  SIDE_LABEL_PREFIX, SIDE_NEW_THREAD_TITLE, sidechatTabRootThreadId, sidechatTabThreadId,
} from '../sidechat-core.ts'
import { noteKnownSidechatSession, registerSidechatDraft } from './api.ts'
import { t } from './locales.ts'
import type { SessionScope } from './api.ts'
import type { SidebarTab } from './state.ts'
import css from './SideChatView.module.css'

/** The thread a tab is bound to (durable in tab.meta across refreshes). */
export function sidechatThreadIdOf(tab: SidebarTab): SessionIdType | undefined {
  return sidechatTabThreadId(tab.meta)
}

/** Root Side Chat identity whose live handle belongs to this navigable tab. */
export function sidechatRootThreadIdOf(tab: SidebarTab): SessionIdType | undefined {
  return sidechatTabRootThreadId(tab.meta)
}

function threadDisplayTitle(title: string): string {
  if (title === SIDE_NEW_THREAD_TITLE) return t('sideChatUntitled')
  return title.startsWith(SIDE_LABEL_PREFIX) ? title.slice(SIDE_LABEL_PREFIX.length) : title
}

/**
 * Mount one explicit Session into the canonical conversation renderer.
 *
 * The official and legacy workbenches share this leaf while their occurrence
 * owners stay separate. Mounting only owns the renderer attachment; draft
 * admission, Host Agent lifetime, and durable tab state belong to the
 * enclosing occurrence owner and therefore survive a React remount.
 * @param props - Session identity, renderer service, and descendant navigation.
 * @returns the conversation host element.
 */
export function SideChatSessionView(props: {
  ctx: SidebarContext
  threadId: SessionIdType
  displayHostSessionId: SessionIdType
  openSession(sessionId: SessionIdType): void
}): React.ReactNode {
  const { ctx, threadId, displayHostSessionId, openSession } = props
  const conversationHost = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = conversationHost.current
    if (host === null) return
    return ctx.uiRenderer.mountSession(host, 'main.conversation', threadId, {
      renderMode: 'sidechat',
      displayHostSessionId,
      openSession,
    })
  }, [ctx.uiRenderer, displayHostSessionId, openSession, threadId])

  return (
    <div className={css.sidechat}>
      <div ref={conversationHost} className={css.sidechatCanonical} />
    </div>
  )
}

/** One Side Chat tab: thread creation plus the canonical conversation slot. */
export function SideChatView(props: {
  ctx: SidebarContext
  scope: SessionScope
  tab: SidebarTab
  visible: boolean
}): React.ReactNode {
  const { ctx, scope, tab } = props
  const list = useSyncExternalStore(
    useMemo(() => (callback: () => void) => ctx.sessions.list.subscribe(callback), [ctx]),
    useCallback(() => ctx.sessions.list.getSnapshot(), [ctx]),
  )
  const threadId = sidechatThreadIdOf(tab)
  const rootThreadId = sidechatRootThreadIdOf(tab)
  const provisional = (tab.meta as { provisional?: unknown } | undefined)?.provisional === true
  const summary = threadId === undefined ? undefined : list.byId[threadId]
  const published = summary?.blank === false
  const openSession = useCallback((sessionId: SessionIdType): void => {
    ctx.get('betterSidebar')?.updateTab(tab.id, {
      meta: { threadId: sessionId, ...(rootThreadId === undefined ? {} : { rootThreadId }) },
    })
  }, [ctx, rootThreadId, tab.id])

  useEffect(() => {
    if (threadId === undefined) return
    noteKnownSidechatSession(threadId)
  }, [threadId])

  useEffect(() => {
    if (threadId === undefined || !provisional || published) return
    const forgetDraft = registerSidechatDraft(threadId, SessionId(scope.sessionId))
    const unstage = ctx.sessions.stageProvisional({
      sessionId: threadId,
      parentSessionId: SessionId(scope.sessionId),
      origin: 'subagent',
      title: SIDE_NEW_THREAD_TITLE,
    })
    return () => {
      forgetDraft()
      unstage()
    }
  }, [ctx.sessions, provisional, published, scope.sessionId, threadId])

  useEffect(() => {
    if (threadId === undefined || !provisional || !published) return
    ctx.get('betterSidebar')?.updateTab(tab.id, { meta: { threadId } })
  }, [ctx, provisional, published, tab.id, threadId])

  useEffect(() => {
    const display = summary?.displayTitle
    if (display === undefined || !published) return
    const title = threadDisplayTitle(display)
    if (title === '' || title === tab.title) return
    try {
      ctx.get('betterSidebar')?.updateTab(tab.id, { title })
    } catch {
      // A stale tab title does not affect the durable Session or renderer.
    }
  }, [summary, published, tab.id, tab.title, ctx])

  if (threadId === undefined) return null
  return (
    <SideChatSessionView
      ctx={ctx}
      threadId={threadId}
      displayHostSessionId={SessionId(scope.sessionId)}
      openSession={openSession}
    />
  )
}
