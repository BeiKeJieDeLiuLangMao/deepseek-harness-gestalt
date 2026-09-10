/**
 * Event parser and sender evidence classification for DingTalk DWS events.
 *
 * @module @deepseek-ai/dsh-im-dingtalk/parser
 */

import type {
  ImSenderClassification,
  ImSenderEvidence,
  ReceiveInboundOptions,
} from '@deepseek-ai/dsh-im-core/delivery'
import type { ImAccountId, ImConversationKind } from '@deepseek-ai/dsh-im-core/types'
import type { DwsEventRawPayload } from './types.ts'

/**
 * Classifies the sender and produces justified evidence according to strict facts.
 * Invariants:
 * - Never guess unknown sender facts (User Story 18).
 * - Distinguish human_native, human_dsh, ai_outbound, external, and unknown.
 * - If self account has no explicit clientSource evidence, classify as unknown instead of assuming human_native.
 *
 * @param payload - Raw DWS event payload.
 * @param managedUserId - Optional managed user identifier for self account match.
 * @returns Classification tag and structured evidence object.
 */
export function classifySender(
  payload: DwsEventRawPayload,
  managedUserId?: string,
): { classification: ImSenderClassification; evidence: ImSenderEvidence } {
  const rawSenderId = payload.senderId ?? payload.sender_id
  const senderId = rawSenderId !== undefined && rawSenderId !== null ? String(rawSenderId) : ''
  const rawSenderNickVal = payload.senderNick ?? payload.sender_nick
  const senderNick = rawSenderNickVal ? String(rawSenderNickVal) : undefined
  const isSelf = Boolean(payload.isSelf ?? payload.is_self ?? (managedUserId && senderId === managedUserId))
  const isAi = Boolean(payload.aiTag ?? payload.ai_tag)
  const clientSource = typeof payload.clientSource === 'string' ? payload.clientSource : undefined

  const nick = senderNick !== undefined ? { rawSenderNick: senderNick } : {}

  if (!isSelf) {
    return {
      classification: 'external',
      evidence: {
        rawSenderId: senderId,
        ...nick,
        isSelfAccount: false,
        clientSource: 'external',
      },
    }
  }

  // It is the self account: determine whether it is AI outbound echo, native human, or dsh manual
  if (isAi || clientSource === 'ai_agent') {
    return {
      classification: 'ai_outbound',
      evidence: {
        rawSenderId: senderId,
        ...nick,
        isSelfAccount: true,
        clientSource: 'ai_agent',
        notes: 'DWS event marked with AI tag or AI agent source',
      },
    }
  }

  if (clientSource === 'dsh_manual') {
    return {
      classification: 'human_dsh',
      evidence: {
        rawSenderId: senderId,
        ...nick,
        isSelfAccount: true,
        clientSource: 'dsh_manual',
      },
    }
  }

  if (clientSource === 'native_app') {
    return {
      classification: 'human_native',
      evidence: {
        rawSenderId: senderId,
        ...nick,
        isSelfAccount: true,
        clientSource: 'native_app',
      },
    }
  }

  // Self account without explicit clientSource evidence must remain unknown (Spec Story 18)
  return {
    classification: 'unknown',
    evidence: {
      rawSenderId: senderId,
      ...nick,
      isSelfAccount: true,
      notes: 'Ambiguous self message evidence: clientSource absent or unrecognized',
    },
  }
}

/**
 * Extracts plain text content from a raw payload text or structured object.
 *
 * @param content - Unknown raw content object or string.
 * @returns Plain text representation.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    return JSON.stringify(obj)
  }
  return ''
}

/**
 * Parses one raw NDJSON line from DWS into ReceiveInboundOptions, or null if line is ignorable/not a chat message.
 *
 * @param line - Raw line text from DWS stdout.
 * @param accountId - Associated IM account ID.
 * @param managedUserId - Optional managed user ID.
 * @returns Inbound delivery options or null if line is ignorable.
 */
export function parseDwsEventLine(
  line: string,
  accountId: ImAccountId,
  managedUserId?: string,
): ReceiveInboundOptions | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Skip DWS banner / status output like "[event] ready"
  if (trimmed.startsWith('[event]') || trimmed.startsWith('[INFO]') || trimmed.startsWith('dws event consume')) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Malformed JSON line
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as DwsEventRawPayload

  // Determine externalMessageId
  const externalMessageId = String(payload.msgId ?? payload.message_id ?? '')
  if (!externalMessageId) return null

  // Determine conversationId
  const conversationId = String(payload.openConversationId ?? payload.conversation_id ?? '')
  if (!conversationId) return null

  // Determine conversationKind: if event specifies type or if openConversationId starts with 'cid'
  let conversationKind: ImConversationKind = 'group'
  if (payload.type === 'single' || payload.event_type === 'chat.single' || payload.event_key === 'chat.single') {
    conversationKind = 'direct'
  } else if (payload.type === 'group' || payload.event_type === 'chat.group' || payload.event_key === 'chat.group') {
    conversationKind = 'group'
  }

  const { classification, evidence } = classifySender(payload, managedUserId)
  const text = extractTextContent(payload.content ?? payload.text)

  return {
    scope: {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind,
    },
    externalMessageId,
    senderClassification: classification,
    senderEvidence: evidence,
    content: {
      text,
      contentType: 'text',
      rawPayload: payload,
    },
    receivedAt: typeof payload.timestamp === 'number'
      ? new Date(payload.timestamp).toISOString()
      : typeof payload.timestamp === 'string'
        ? payload.timestamp
        : new Date().toISOString(),
  }
}
