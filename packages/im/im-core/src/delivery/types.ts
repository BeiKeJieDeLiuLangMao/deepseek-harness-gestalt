/**
 * Types for IM delivery, history, message states, cursors, receipts, and outbound tracking.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImAccountId, ImConversationKind, ImPlatform } from '../types.ts'

/** Opaque branded identifier of one internal IM message record. */
export type ImMessageId = Branded<'ImMessageId'>

/** Opaque branded identifier of one outbound delivery request. */
export type ImOutboundRequestId = Branded<'ImOutboundRequestId'>

/**
 * Validated scope identifier distinguishing real channels from simulation instances.
 * Format:
 * - Real: `real:${platform}:${accountId}:${conversationId}`
 * - Sim:  `sim:${instanceId}:${conversationId}`
 */
export type ImScopeId = Branded<'ImScopeId'>

/** Real platform scope specification. */
export interface ImRealDeliveryScope {
  readonly kind: 'real'
  readonly platform: ImPlatform
  readonly accountId: ImAccountId
  readonly conversationId: string
  readonly conversationKind?: ImConversationKind
}

/** Simulation scope specification. */
export interface ImSimDeliveryScope {
  readonly kind: 'sim'
  readonly instanceId: string
  readonly conversationId: string
  readonly conversationKind?: ImConversationKind
}

export type ImDeliveryScope = ImRealDeliveryScope | ImSimDeliveryScope

/**
 * Sender classification:
 * - external: message from third-party / external group member
 * - ai_outbound: echo of agent outbound reply
 * - human_native: human owner spoke natively on IM app
 * - human_dsh: human owner spoke through DSH manual send
 * - unknown: identity cannot be definitively established
 */
export type ImSenderClassification =
  | 'external'
  | 'ai_outbound'
  | 'human_native'
  | 'human_dsh'
  | 'unknown'

/**
 * Evidence carrying facts justifying the sender classification.
 */
export interface ImSenderEvidence {
  readonly rawSenderId?: string
  readonly rawSenderNick?: string
  readonly matchedOutboundRequestId?: ImOutboundRequestId
  readonly isSelfAccount?: boolean
  readonly clientSource?: 'native_app' | 'dsh_manual' | 'ai_agent' | 'external'
  readonly notes?: string
}

/**
 * Message lifecycle stage:
 * - received: persisted in domain storage, cursor advanced
 * - submitted: submitted to agent workspace / queue (not yet externally sent)
 * - sent: externally sent to IM platform / partner
 */
export type ImMessageStage = 'received' | 'submitted' | 'sent'

/**
 * Content payload of an IM message.
 */
export interface ImMessageContent {
  readonly text: string
  readonly contentType?: 'text' | 'markdown' | 'unsupported'
  readonly rawPayload?: Readonly<Record<string, unknown>>
}

/**
 * Normalized record of an inbound message.
 */
export interface InboundMessageRecord {
  readonly messageId: ImMessageId
  readonly scopeId: ImScopeId
  readonly externalMessageId: string
  readonly senderClassification: ImSenderClassification
  readonly senderEvidence: ImSenderEvidence
  readonly stage: ImMessageStage
  readonly content: ImMessageContent
  readonly sequenceNumber: number
  readonly receivedAt: string
  readonly submittedAt?: string
  readonly metadata?: Readonly<Record<string, string>>
}

/**
 * Outbound message intent: agent automated reply or human DSH manual send.
 */
export type ImOutboundIntent = 'ai' | 'human_manual'

/**
 * Outbound delivery status:
 * - pending: queued / waiting pre-send check
 * - pre_send_failed: failed before transmission (e.g. conversation disabled, account paused, validation error)
 * - sent: successfully delivered with platform receipt
 * - result_unknown: ambiguous receipt; platform status undetermined, MUST NOT blindly retry
 * - confirmed_failed: confirmed failed after receipt inquiry or terminal error
 */
export type ImOutboundStatus =
  | 'pending'
  | 'pre_send_failed'
  | 'sent'
  | 'result_unknown'
  | 'confirmed_failed'

/**
 * Platform receipt details for outbound delivery.
 */
export interface ImOutboundReceipt {
  readonly externalReceiptId?: string
  readonly timestamp?: string
  readonly rawStatus?: string
  readonly errorCode?: string
  readonly errorMessage?: string
}

/**
 * Normalized record of an outbound delivery request.
 */
export interface OutboundMessageRecord {
  readonly requestId: ImOutboundRequestId
  readonly messageId?: ImMessageId
  readonly scopeId: ImScopeId
  readonly workspaceId?: WorkspaceId
  readonly intent: ImOutboundIntent
  readonly content: ImMessageContent
  readonly status: ImOutboundStatus
  readonly preSendFailureReason?: string
  readonly receipt?: ImOutboundReceipt
  readonly createdAt: string
  readonly updatedAt: string
  readonly replyToExternalMessageId?: string
}

/**
 * Progress cursor for an IM conversation scope.
 */
export interface ImConversationCursor {
  readonly scopeId: ImScopeId
  readonly lastReceivedExternalMessageId?: string
  readonly lastReceivedSequenceNumber: number
  readonly lastSubmittedSequenceNumber: number
  readonly lastSentSequenceNumber: number
  readonly unsubmittedCount: number
  readonly updatedAt: string
}

/**
 * Options for querying conversation history.
 */
export interface ImHistoryQueryOptions {
  readonly scopeId: ImScopeId
  readonly limit?: number
  readonly beforeSequenceNumber?: number
  readonly afterSequenceNumber?: number
  readonly stages?: ImMessageStage[]
}

/**
 * Inbound delivery input request.
 */
export interface ReceiveInboundOptions {
  readonly scope: ImDeliveryScope
  readonly externalMessageId: string
  readonly senderClassification: ImSenderClassification
  readonly senderEvidence: ImSenderEvidence
  readonly content: ImMessageContent
  readonly receivedAt?: string
  readonly metadata?: Record<string, string>
}

/**
 * Inbound delivery result.
 */
export interface ReceiveInboundResult {
  readonly duplicate: boolean
  readonly message: InboundMessageRecord
  readonly cursor: ImConversationCursor
}

/**
 * Submit message to agent workspace options.
 */
export interface MarkSubmittedOptions {
  readonly scopeId: ImScopeId
  readonly messageIds: ImMessageId[]
  readonly submittedAt?: string
}

/**
 * Outbound pre-send registration options.
 */
export interface RegisterOutboundOptions {
  readonly requestId: ImOutboundRequestId
  readonly scope: ImDeliveryScope
  readonly workspaceId?: WorkspaceId
  readonly intent: ImOutboundIntent
  readonly content: ImMessageContent
  readonly replyToExternalMessageId?: string
}

/**
 * Complete outbound request options.
 */
export interface SettleOutboundOptions {
  readonly requestId: ImOutboundRequestId
  readonly status: 'sent' | 'result_unknown' | 'confirmed_failed'
  readonly receipt?: ImOutboundReceipt
  readonly externalMessageId?: string
}
