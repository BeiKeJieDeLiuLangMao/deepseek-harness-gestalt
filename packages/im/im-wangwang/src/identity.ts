/**
 * Inbound sender identity resolution for Wangwang events.
 *
 * Pure classification from upstream claims (`senderType`, `producerId`) plus
 * durable local outbox echo evidence. Local evidence always wins over upstream
 * self-attestation; an unresolved or conflicting claim degrades to `unknown`
 * so an own-send echo never re-enters the agent loop as a customer message.
 *
 * @module @deepseek-ai/dsh-im-wangwang/identity
 */

import type { ImOutboundIntent, ImOutboundRequestId } from '@deepseek-ai/dsh-im-core/delivery'
import type {
  WangwangAdmittedMerchant,
  WangwangRawEvent,
  WangwangSenderResolution,
} from './types.ts'

/**
 * Local outbox echo evidence for one settled DSH outbound send, read back from
 * the adapter's durable `sent_echoes` table.
 */
export interface WangwangOutboxEcho {
  readonly requestId: ImOutboundRequestId
  readonly intent: ImOutboundIntent
}

/**
 * Resolve the sender identity of one inbound Wangwang event.
 *
 * Invariants:
 * - senderType 1: external customer (`external`).
 * - senderType 2 (upstream claims human operator):
 *   - matching local echo with intent `human_manual` -> `human_dsh`
 *   - matching local echo with intent `ai` -> `unknown` (claim conflicts with local evidence)
 *   - no local echo -> `human_native` (human operator native to QianNiu)
 * - senderType 3 (upstream claims AI):
 *   - matching local echo with intent `ai` -> `ai_outbound`
 *   - matching local echo with intent `human_manual` -> `unknown` (claim conflicts)
 *   - no local echo -> `unknown` (unverified AI sender; upstream facts retained in notes)
 * - any other senderType -> `unknown`.
 *
 * @param event - Raw Wangwang event from the OpenAPI events poll.
 * @param merchant - Admitted merchant the event belongs to.
 * @param matchedEcho - Local outbox echo evidence for `event.messageId`, when present.
 * @returns Sender classification plus factual evidence.
 */
export function resolveWangwangSender(
  event: WangwangRawEvent,
  merchant: WangwangAdmittedMerchant,
  matchedEcho?: WangwangOutboxEcho,
): WangwangSenderResolution {
  // The client passes upstream senderType through unverified; compare as an
  // opaque value so out-of-union runtime claims fall through to `unknown`.
  const senderType: unknown = event.senderType

  if (senderType === 1) {
    return {
      classification: 'external',
      evidence: {
        rawSenderId: event.customerId,
        ...(event.customerNick !== undefined ? { rawSenderNick: event.customerNick } : {}),
        clientSource: 'external',
        isSelfAccount: false,
      },
    }
  }

  const selfSenderId = merchant.mainServiceAccountId ?? merchant.merchantId

  if (senderType === 2) {
    if (matchedEcho && matchedEcho.intent === 'human_manual') {
      return {
        classification: 'human_dsh',
        evidence: {
          rawSenderId: selfSenderId,
          matchedOutboundRequestId: matchedEcho.requestId,
          clientSource: 'dsh_manual',
          isSelfAccount: true,
        },
      }
    }
    if (matchedEcho) {
      return {
        classification: 'unknown',
        evidence: {
          rawSenderId: selfSenderId,
          matchedOutboundRequestId: matchedEcho.requestId,
          isSelfAccount: true,
          notes: `claim_conflict:upstream_human_native_vs_local_${matchedEcho.intent}`,
        },
      }
    }
    return {
      classification: 'human_native',
      evidence: {
        rawSenderId: selfSenderId,
        clientSource: 'native_app',
        isSelfAccount: true,
      },
    }
  }

  if (senderType === 3) {
    if (matchedEcho && matchedEcho.intent === 'ai') {
      return {
        classification: 'ai_outbound',
        evidence: {
          rawSenderId: merchant.merchantId,
          matchedOutboundRequestId: matchedEcho.requestId,
          clientSource: 'ai_agent',
          isSelfAccount: true,
          ...(event.producerId ? { notes: `upstream_producer:${event.producerId}` } : {}),
        },
      }
    }
    if (matchedEcho) {
      return {
        classification: 'unknown',
        evidence: {
          rawSenderId: merchant.merchantId,
          matchedOutboundRequestId: matchedEcho.requestId,
          isSelfAccount: true,
          notes: `claim_conflict:upstream_ai_vs_local_${matchedEcho.intent}`,
        },
      }
    }
    return {
      classification: 'unknown',
      evidence: {
        rawSenderId: merchant.merchantId,
        clientSource: 'external',
        isSelfAccount: false,
        notes: event.producerId ? `upstream_unverified_ai:${event.producerId}` : 'unverified_ai_sender',
      },
    }
  }

  return {
    classification: 'unknown',
    evidence: {
      rawSenderId: typeof senderType === 'number' || typeof senderType === 'string' ? String(senderType) : 'unknown',
      notes: 'Unrecognized senderType or conflicting client claim',
    },
  }
}
