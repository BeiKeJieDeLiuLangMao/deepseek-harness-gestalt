/**
 * Durable storage domain specification and zod schemas for IM delivery & history.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { workspaceIdSchema } from '../spec.ts'
import type {
  ImConversationCursor,
  ImMessageId,
  ImOutboundRequestId,
  ImScopeId,
  InboundMessageRecord,
  OutboundMessageRecord,
} from './types.ts'

export const imMessageIdSchema = z.string().min(1).transform((val: string) => brandString<ImMessageId>(val))
export const imOutboundRequestIdSchema = z.string().min(1).transform((val: string) => brandString<ImOutboundRequestId>(val))
export const imScopeIdSchema = z.string().min(1).transform((val: string) => brandString<ImScopeId>(val))

export const imSenderClassificationSchema = z.enum([
  'external',
  'ai_outbound',
  'human_native',
  'human_dsh',
  'unknown',
])

export const imSenderEvidenceSchema = z.object({
  rawSenderId: z.string().optional(),
  rawSenderNick: z.string().optional(),
  matchedOutboundRequestId: imOutboundRequestIdSchema.optional(),
  isSelfAccount: z.boolean().optional(),
  clientSource: z.enum(['native_app', 'dsh_manual', 'ai_agent', 'external']).optional(),
  notes: z.string().optional(),
})

export const imMessageStageSchema = z.enum(['received', 'submitted', 'sent'])

export const imMessageContentSchema = z.object({
  text: z.string(),
  contentType: z.enum(['text', 'markdown', 'unsupported']).optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
})

export const inboundMessageRecordSchema = z.object({
  messageId: imMessageIdSchema,
  scopeId: imScopeIdSchema,
  externalMessageId: z.string().min(1),
  senderClassification: imSenderClassificationSchema,
  senderEvidence: imSenderEvidenceSchema,
  stage: imMessageStageSchema,
  content: imMessageContentSchema,
  sequenceNumber: z.number().int().nonnegative(),
  receivedAt: z.string().datetime(),
  submittedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

export const imOutboundIntentSchema = z.enum(['ai', 'human_manual'])

export const imOutboundStatusSchema = z.enum([
  'pending',
  'pre_send_failed',
  'sent',
  'result_unknown',
  'confirmed_failed',
])

export const imOutboundReceiptSchema = z.object({
  externalReceiptId: z.string().optional(),
  timestamp: z.string().optional(),
  rawStatus: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
})

export const outboundMessageRecordSchema = z.object({
  requestId: imOutboundRequestIdSchema,
  messageId: imMessageIdSchema.optional(),
  scopeId: imScopeIdSchema,
  workspaceId: workspaceIdSchema.optional(),
  intent: imOutboundIntentSchema,
  content: imMessageContentSchema,
  status: imOutboundStatusSchema,
  preSendFailureReason: z.string().optional(),
  receipt: imOutboundReceiptSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  replyToExternalMessageId: z.string().optional(),
})

export const imConversationCursorSchema = z.object({
  scopeId: imScopeIdSchema,
  lastReceivedExternalMessageId: z.string().optional(),
  lastReceivedSequenceNumber: z.number().int().nonnegative(),
  lastSubmittedSequenceNumber: z.number().int().nonnegative(),
  lastSentSequenceNumber: z.number().int().nonnegative(),
  unsubmittedCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
})

/**
 * Dedup entry linking (scopeId + externalMessageId) -> messageId.
 */
export const imInboundDedupRecordSchema = z.object({
  externalKey: z.string().min(1),
  messageId: imMessageIdSchema,
  scopeId: imScopeIdSchema,
  externalMessageId: z.string().min(1),
  recordedAt: z.string().datetime(),
})

export type ImInboundDedupRecord = z.infer<typeof imInboundDedupRecordSchema>

export const imDeliveryDomainStateSchema = z.object({
  initialized: z.boolean(),
})

export type ImDeliveryDomainState = z.infer<typeof imDeliveryDomainStateSchema>

/**
 * Storage domain specification for IM delivery, messages, cursors, and outbound tracking.
 */
export const imDeliveryDomainSpec = defineDomain({
  name: 'im_delivery',
  version: 1,
  global: {
    schema: imDeliveryDomainStateSchema,
    initial: {
      initialized: false,
    },
  },
  tables: {
    inbound_messages: domainTable<ImMessageId, InboundMessageRecord>(
      inboundMessageRecordSchema as unknown as z.ZodType<InboundMessageRecord>,
    ),
    outbound_messages: domainTable<ImOutboundRequestId, OutboundMessageRecord>(
      outboundMessageRecordSchema as unknown as z.ZodType<OutboundMessageRecord>,
    ),
    cursors: domainTable<ImScopeId, ImConversationCursor>(
      imConversationCursorSchema as unknown as z.ZodType<ImConversationCursor>,
    ),
    dedup: domainTable<string, ImInboundDedupRecord>(
      imInboundDedupRecordSchema as unknown as z.ZodType<ImInboundDedupRecord>,
    ),
  },
})
