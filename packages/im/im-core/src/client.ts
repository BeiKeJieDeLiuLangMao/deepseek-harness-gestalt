/**
 * Client-namespace projection of the IM domain: config and delivery types
 * plus the scope-id encoder the GUI uses to query Host remotes.
 *
 * @module @deepseek-ai/dsh-im-core/client
 */

export type * from './types.ts'
export { encodeScopeId } from './delivery/scope.ts'
export type {
  ImDeliveryScope,
  ImGuiHistoryQueryOptions,
  ImGuiInboundView,
  ImGuiOutboundView,
  ImGuiRegisterManualOutboundOptions,
  ImHistoryQueryOptions,
  ImMessageContent,
  ImOutboundIntent,
  ImOutboundRequestId,
  ImOutboundStatus,
  ImScopeId,
  ImSenderClassification,
  ImSenderEvidence,
  InboundMessageRecord,
  ListImOutboundOptions,
  OutboundMessageRecord,
  RegisterOutboundOptions,
} from './delivery/types.ts'
