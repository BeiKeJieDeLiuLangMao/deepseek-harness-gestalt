/**
 * Strip inbound and outbound records down to GUI Remote rows.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/gui-views
 */
import type {
  ImGuiInboundView,
  ImGuiOutboundView,
  InboundMessageRecord,
  OutboundMessageRecord,
} from './types.ts'

/**
 * Present one inbound record without raw payload or metadata.
 * @param record - durable inbound message.
 * @returns GUI Remote inbound row.
 */
export function guiInboundViewOf(record: InboundMessageRecord): ImGuiInboundView {
  return {
    messageId: record.messageId,
    scopeId: record.scopeId,
    senderClassification: record.senderClassification,
    ...(record.senderEvidence.rawSenderNick === undefined
      ? {}
      : { senderNick: record.senderEvidence.rawSenderNick }),
    ...(record.senderEvidence.rawSenderId === undefined
      ? {}
      : { senderId: record.senderEvidence.rawSenderId }),
    stage: record.stage,
    text: record.content.text,
    sequenceNumber: record.sequenceNumber,
    receivedAt: record.receivedAt,
  }
}

/**
 * Present one outbound record without raw payload or receipt.
 * @param record - durable outbound request.
 * @returns GUI Remote outbound row.
 */
export function guiOutboundViewOf(record: OutboundMessageRecord): ImGuiOutboundView {
  return {
    requestId: record.requestId,
    scopeId: record.scopeId,
    intent: record.intent,
    text: record.content.text,
    status: record.status,
    createdAt: record.createdAt,
  }
}
