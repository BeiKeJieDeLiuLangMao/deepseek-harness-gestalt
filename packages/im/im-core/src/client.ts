/**
 * Client-namespace projection of the IM domain: config, delivery, and simulation types.
 *
 * @module @deepseek-ai/dsh-im-core/client
 */

export type * from './types.ts'
export type {
  CreateSimulationInstanceOptions,
  ImGuiCreateSimulationInstanceOptions,
  ImSimulationInstance,
  ImSimulationInstanceId,
} from './simulation/types.ts'
export type {
  ImDeliveryScope,
  ImGuiCancelPendingAiOutboundOptions,
  ImGuiHistoryQueryOptions,
  ImGuiInboundView,
  ImGuiListOutboundOptions,
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
