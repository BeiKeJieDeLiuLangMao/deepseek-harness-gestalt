/** Official workbench body for one occurrence-owned Side Chat. */
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OfficialSidechatContext } from './sidechat-runtime.ts'
import { officialSidechatPayloadOf, type OfficialSidechatPayload } from './payload.ts'
import { SideChatSessionView } from '../SideChatView.tsx'
import { t } from '../locales.ts'

/** Services injected into the official Side Chat body. */
export interface OfficialSidechatInjected {
  readonly ctx: OfficialSidechatContext
}

/** Official slot props for the Side Chat body. */
export type OfficialSidechatBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & OfficialSidechatInjected

/**
 * Render the explicit Session selected by an official Side Chat payload.
 * Descendant navigation patches the same occurrence while retaining its root
 * Agent owner; the surrounding runtime observes that patch independently of
 * this component's mount lifetime.
 * @param props - slot-owned tab information and client services.
 * @returns the canonical conversation renderer, or an unavailable marker for invalid durable data.
 */
export function OfficialSidechatBody({ useTabInfo, ctx }: OfficialSidechatBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const payload = officialSidechatPayloadOf(tab.payload)
  const openSession = useCallback((threadId: SessionId): void => {
    if (payload === undefined) return
    const next: OfficialSidechatPayload = {
      rootThreadId: payload.rootThreadId,
      threadId,
      ...(payload.provisional === true ? { provisional: true as const } : {}),
    }
    ctx.sidebarRight.forSession(tab.sessionId).update(tab.id, { payload: next })
  }, [ctx.sidebarRight, payload, tab.id, tab.sessionId])

  if (payload === undefined) {
    return <div role="status">{t('sideChatError', { message: tab.id })}</div>
  }
  return (
    <SideChatSessionView
      ctx={ctx}
      threadId={SessionId(payload.threadId)}
      displayHostSessionId={tab.sessionId}
      openSession={openSession}
    />
  )
}
