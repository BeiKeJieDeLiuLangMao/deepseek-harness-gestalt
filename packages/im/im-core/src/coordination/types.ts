/**
 * Types for IM execution coordination, group trigger evaluation,
 * safe step boundary preemption, and tool registration.
 *
 * @module @deepseek-ai/dsh-im-core/coordination/types
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  ImDeliveryScope,
  ImMessageId,
  ImScopeId,
  InboundMessageRecord,
} from '../delivery/types.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    im: { readonly kind: 'im'; readonly scopeId: string; readonly form: 'notice'; readonly summary: string }
  }
}

/**
 * Trigger reason explaining why message batch was admitted and steered.
 */
export type ImTriggerReason = 'mention' | 'everyN' | 'fixedInterval' | 'direct'

/**
 * Options for admitting inbound messages into execution coordination.
 */
export interface AdmitInboundOptions {
  /** Single inbound message to admit. */
  readonly message?: InboundMessageRecord
  /** Batch of inbound messages to admit. */
  readonly messages?: readonly InboundMessageRecord[]
  /** Optional explicit delivery scope. */
  readonly scope?: ImDeliveryScope
  /** Optional explicit scope ID. */
  readonly scopeId?: ImScopeId
  /**
   * Target agent to steer. If omitted, resolved via workspace binding.
   */
  readonly agent?: Pick<Agent, 'steer' | 'session'>
  /** Explicit timestamp for deterministic testing of intervals. */
  readonly now?: Date | string | number
}

/**
 * Result of execution coordination inbound admission.
 */
export interface AdmitInboundResult {
  /** Whether the message(s) triggered agent steering. */
  readonly triggered: boolean
  /** The specific reason trigger fired, if triggered. */
  readonly triggerReason?: ImTriggerReason | undefined
  /** Number of messages steered into agent context. */
  readonly steeredCount?: number | undefined
  /** IDs of messages marked submitted. */
  readonly messageIds?: readonly ImMessageId[] | undefined
  /** Workspace ID to which message was routed, if matched. */
  readonly workspaceId?: WorkspaceId | undefined
}
