/**
 * Client-safe types for the Wangwang / QianNiu IM adapter seam.
 *
 * @module @deepseek-ai/dsh-im-wangwang/types
 */

import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { ImOutboundRequestId, ImSenderClassification, ImSenderEvidence } from '@deepseek-ai/dsh-im-core/delivery'

/**
 * Static configuration of an admitted merchant in directory.
 * Runtime self-discovery / guessing is disallowed.
 */
export interface WangwangAdmittedMerchant {
  /** Merchant identifier admitted by platform. */
  readonly merchantId: string
  /** Harness account identifier mapping to this merchant. */
  readonly accountId: ImAccountId
  /** Display name for merchant. */
  readonly displayName?: string
  /** Reference to AccessKey in CredentialProvider. Never plaintext. */
  readonly accessKeyRef: CredentialRef
  /** Reference to SecretKey in CredentialProvider. Never plaintext. */
  readonly secretKeyRef: CredentialRef
  /** Merchant main service account id for echo/identity matching. */
  readonly mainServiceAccountId?: string
}

/**
 * Adapter configuration for Wangwang / QianNiu.
 */
export interface WangwangAdapterConfig {
  /** Target OpenAPI endpoint URL. */
  readonly endpoint: string
  /** Pre-configured admitted merchant directory. Runtime addition or UI guessing forbidden. */
  readonly admittedMerchants: readonly WangwangAdmittedMerchant[]
  /** Clock drift tolerance in milliseconds. Defaults to 300,000ms (5 mins). */
  readonly timestampToleranceMs?: number
  /** Polling batch limit. Defaults to 50, maximum 100. */
  readonly pollLimit?: number
}

/**
 * Credentials resolved internally via credential seam. Never logged or exposed.
 */
export interface ResolvedWangwangCredentials {
  readonly accessKey: string
  readonly secretKey: string
}

/**
 * Signed request headers and canonical query string.
 */
export interface SignedWangwangRequest {
  readonly queryString: string
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Wangwang raw event from OpenAPI events poll.
 */
export interface WangwangRawEvent {
  readonly eventId: string
  readonly merchantId: string
  readonly senderType: 1 | 2 | 3
  readonly messageId: string
  readonly customerId: string
  readonly customerNick?: string
  readonly customerAvatar?: string
  readonly conversationId: string
  readonly msgType: 1 | 2
  readonly textContent: string
  readonly attachments?: readonly {
    readonly mediaType: string
    readonly mediaUrl: string
    readonly label?: string
  }[]
  readonly msgTime: number
  readonly producerId?: string
  /** Raw upstream payload, always populated by the OpenAPI client. */
  readonly raw: Readonly<Record<string, unknown>>
}

/**
 * Outbound send request for Wangwang.
 */
export interface WangwangSendMessageRequest {
  readonly accountId: ImAccountId
  readonly merchantId: string
  readonly customerId: string
  readonly content: string
  readonly userId: string
  readonly producerId?: string
  readonly producerRevision?: string
  readonly requestId: ImOutboundRequestId
  readonly isAi?: boolean
}

/**
 * Outbound send result from Wangwang OpenAPI.
 */
export interface WangwangSendMessageResult {
  readonly status: 'sent' | 'result_unknown' | 'pre_send_failed'
  readonly messageId?: string
  readonly receiptId?: string
  readonly producerId?: string
  readonly producerRevision?: string
  readonly error?: string
  readonly rawResponse?: unknown
}

/**
 * Result of resolving inbound sender classification and evidence facts.
 */
export interface WangwangSenderResolution {
  readonly classification: ImSenderClassification
  readonly evidence: ImSenderEvidence
}
