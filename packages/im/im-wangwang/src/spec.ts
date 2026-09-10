/**
 * Storage domain specification and Zod validation schemas for Wangwang adapter domain.
 * Provides durable channel cursor storage surviving host restarts and process crashes.
 *
 * @module @deepseek-ai/dsh-im-wangwang/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { ImOutboundRequestId } from '@deepseek-ai/dsh-im-core/delivery'
import type {
  WangwangAdapterConfig,
} from './types.ts'

/** Zod schema branding a plain string into a CredentialRef. */
export const credentialRefSchema = z.string().min(1).transform((val: string) => brandString<CredentialRef>(val))
/** Zod schema branding a plain string into an ImAccountId. */
export const imAccountIdSchema = z.string().min(1).transform((val: string) => brandString<ImAccountId>(val))

/** Zod schema for one admitted merchant directory entry. */
export const wangwangAdmittedMerchantSchema = z.object({
  merchantId: z.string().min(1),
  accountId: imAccountIdSchema,
  displayName: z.string().optional(),
  accessKeyRef: credentialRefSchema,
  secretKeyRef: credentialRefSchema,
  mainServiceAccountId: z.string().optional(),
})

/** Zod schema for the Wangwang adapter configuration. */
export const wangwangAdapterConfigSchema = z.object({
  endpoint: z.url(),
  admittedMerchants: z.array(wangwangAdmittedMerchantSchema).min(1),
  timestampToleranceMs: z.number().int().positive().optional().default(300_000),
  pollLimit: z.number().int().min(1).max(100).optional().default(50),
})

/**
 * Validate raw adapter configuration, failing loud on any malformed field.
 * @param input - Raw configuration value (e.g. from cordis.yml).
 * @returns The validated adapter configuration.
 */
export function validateWangwangConfig(input: unknown): WangwangAdapterConfig {
  return wangwangAdapterConfigSchema.parse(input) as WangwangAdapterConfig
}

/**
 * Durable record of channel polling cursor for one admitted merchant.
 */
export interface WangwangChannelCursorRecord {
  readonly merchantId: string
  readonly sinceId: number
  readonly updatedAt: string
}

/** Zod schema validating cursor records at the durable boundary. */
export const wangwangChannelCursorRecordSchema = z.object({
  merchantId: z.string().min(1),
  sinceId: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
})

/**
 * Durable local outbox echo evidence for one settled DSH outbound send.
 * Written only after ImDeliveryService settles the request as `sent` with a
 * platform receipt; inbound sender resolution consults this table so an echo
 * of our own send is never mistaken for an external or unverified message.
 */
export interface WangwangSentEchoRecord {
  readonly messageId: string
  readonly merchantId: string
  readonly requestId: ImOutboundRequestId
  readonly intent: 'ai' | 'human_manual'
  readonly settledAt: string
}

/** Zod schema validating sent-echo records at the durable boundary. */
export const wangwangSentEchoRecordSchema = z.object({
  messageId: z.string().min(1),
  merchantId: z.string().min(1),
  requestId: z.string().min(1).transform((val: string) => brandString<ImOutboundRequestId>(val)),
  intent: z.enum(['ai', 'human_manual']),
  settledAt: z.iso.datetime(),
})

/**
 * Storage key of one sent-echo record: merchant-scoped so identical platform
 * messageIds from different merchants never collide.
 * @param merchantId - Platform merchant identifier.
 * @param messageId - Platform message identifier from the send receipt.
 * @returns The composite storage key.
 */
export function wangwangSentEchoKey(merchantId: string, messageId: string): string {
  return `${merchantId}::${messageId}`
}

/** Zod schema for the domain global slot. */
export const wangwangDomainStateSchema = z.object({
  initialized: z.boolean(),
})

/** Domain global slot value type. */
export type WangwangDomainState = z.infer<typeof wangwangDomainStateSchema>

/**
 * Dedicated storage domain for Wangwang adapter (`im_wangwang`).
 * Preserves merchant channel cursors and settled-send echo evidence across restarts.
 */
export const wangwangDomainSpec = defineDomain({
  name: 'im_wangwang',
  version: 1,
  global: {
    schema: wangwangDomainStateSchema,
    initial: {
      initialized: false,
    },
  },
  tables: {
    channel_cursors: domainTable<string, WangwangChannelCursorRecord>(
      wangwangChannelCursorRecordSchema as unknown as z.ZodType<WangwangChannelCursorRecord>,
    ),
    sent_echoes: domainTable<string, WangwangSentEchoRecord>(
      wangwangSentEchoRecordSchema as unknown as z.ZodType<WangwangSentEchoRecord>,
    ),
  },
})
