/**
 * Map IM domain records onto the Sidebar conversation view. Secrets never
 * enter these rows; live account reads and outbound adapters stay off this path.
 */

import type { ImDeliveryState, ImSenderBadge } from './model.ts'
import type { ImConversationMessageView } from './model.ts'

/** Domain sender classification accepted by the conversation tab. */
export type ImDomainSender =
  | 'external'
  | 'ai_outbound'
  | 'human_native'
  | 'human_dsh'
  | 'unknown'

/** Inbound stage from imDelivery. */
export type ImDomainInboundStage = 'received' | 'submitted' | 'sent'

/** Outbound status from imDelivery. `result_unknown` is never success. */
export type ImDomainOutboundStatus =
  | 'pending'
  | 'pre_send_failed'
  | 'sent'
  | 'result_unknown'
  | 'confirmed_failed'

/** One inbound or outbound record the Sidebar can present. */
export interface ImDomainConversationRecord {
  readonly id: string
  readonly text: string
  readonly who: string
  readonly sender: ImDomainSender
  readonly inboundStage?: ImDomainInboundStage
  readonly outboundStatus?: ImDomainOutboundStatus
}

/**
 * Map a domain sender classification onto the GUI badge.
 * @param sender - domain classification.
 */
export function senderBadgeOf(sender: ImDomainSender): ImSenderBadge {
  return sender
}

/**
 * Map inbound stage and outbound status onto GUI delivery. Outbound
 * `result_unknown` stays distinct from `sent`.
 * @param record - domain record.
 */
export function deliveryStateOf(record: ImDomainConversationRecord): ImDeliveryState {
  if (record.outboundStatus === 'result_unknown') return 'result_unknown'
  if (record.outboundStatus === 'confirmed_failed' || record.outboundStatus === 'pre_send_failed') {
    return 'confirmed_failed'
  }
  if (record.outboundStatus === 'pending') return 'pending'
  if (record.outboundStatus === 'sent') return 'sent'
  if (record.inboundStage === 'submitted') return 'submitted'
  if (record.inboundStage === 'sent') return 'sent'
  return 'received'
}

/**
 * Project domain conversation records into Sidebar rows.
 * @param records - inbound and outbound facts for one shared stream.
 */
export function conversationMessagesFromRecords(
  records: readonly ImDomainConversationRecord[],
): ImConversationMessageView[] {
  return records.map(record => ({
    id: record.id,
    text: record.text,
    who: record.who,
    sender: senderBadgeOf(record.sender),
    delivery: deliveryStateOf(record),
  }))
}

/**
 * External behaviors this GUI and the keyless assembled scenario leave to a
 * separately authorized live lane. Named so dry-run evidence cannot be
 * presented as live end-to-end evidence.
 */
export const IM_LIVE_LANE_BEHAVIORS = [
  'real DingTalk DWS login and account directory read',
  'real Wangwang endpoint/AK/SK account read',
  'real outbound send to a live conversation',
  'real model calls for agent replies',
  'native Desktop GUI computer-use acceptance of the Sidebar',
] as const
