import { memo, useMemo } from 'react'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import css from './ChatView.module.css'

interface ChatNodeSeatProps extends Omit<ChatNodeOwnerProps, 'selectCall'> {
  readonly nodeKey: string
  readonly openDetails: ChatViewSlotProps['openDetails']
  readonly useSession: ChatViewSlotProps['useSession']
  readonly renderSlot: ChatViewSlotProps['renderSlot']
  readonly t: ChatViewSlotProps['t']
}

type RoutedChatNodeOwner = {
  [Kind in ChatNode['kind']]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> }
}[ChatNode['kind']]

/**
 * Subscribe and dispatch one stable Context key without observing sibling Nodes.
 * `selectCall` opens details; `browser_*` rows use that path to focus a listed Dock tab.
 */
export const ChatNodeSeat = memo(function ChatNodeSeat({
  nodeKey, selectedCallId, cwd, openDetails, openFile, inspectCall, forkAt,
  loadImage, fileMentions, useSession, renderSlot, t,
}: ChatNodeSeatProps) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey))
  const routedNode = node as ChatNode | undefined
  const owner = useMemo<ChatNodeOwnerProps | null>(() => {
    if (node === undefined) return null
    const location = node.location
    const turnSeq = location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : 0
    return {
      selectedCallId,
      cwd,
      openFile,
      inspectCall,
      forkAt,
      loadImage,
      fileMentions,
      selectCall: (callId, toolName) => {
        openDetails({ turnSeq, callId, toolName })
      },
    }
  }, [node, selectedCallId, cwd, openDetails, openFile, inspectCall, forkAt, loadImage, fileMentions])
  if (routedNode === undefined || owner === null) return null
  // Runtime dispatch owns the correlation: every Node's discriminant is the
  // keyed-slot entry passed alongside that same Node. TypeScript does not
  // distribute an object containing a union into a union of objects itself.
  const routedOwner = { ...owner, node: routedNode } as RoutedChatNodeOwner
  return (
    <div
      className={css.flowItem}
      data-chat-anchor-key={routedNode.key}
      data-chat-flow-key={routedNode.key}
      data-chat-flow-kind={routedNode.kind}
    >
      {renderSlot('conversation.chat.node', routedOwner, {
        entryKey: routedNode.kind,
        hookContext: nodeKey,
        fallback: (
          <JsonBlock
            label={t('message.unknownSurface', { type: routedNode.kind })}
            payload={routedNode.data}
            truncatedLabel={total => t('json.truncated', { total })}
          />
        ),
      })}
    </div>
  )
})
