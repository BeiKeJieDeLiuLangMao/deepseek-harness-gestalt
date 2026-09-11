/**
 * Types for IM simulation instance management and target freezing.
 *
 * @module @deepseek-ai/dsh-im-core/simulation/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImAccountId, ImConversationKind } from '../types.ts'

export type ImSimulationInstanceId = Branded<'ImSimulationInstanceId'>

export type ImSimulationInstanceStatus = 'running' | 'stopped'

export interface ImSimulationTargetSnapshot {
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly conversationId: string
}

/** Frozen simulation instance the GUI lists and the Sidebar stream binds. */
export interface ImSimulationInstance {
  readonly instanceId: ImSimulationInstanceId
  readonly workspaceId: WorkspaceId
  readonly testedWorkspaceId: WorkspaceId
  readonly target: ImSimulationTargetSnapshot
  readonly speakingMembers?: readonly string[]
  readonly status: ImSimulationInstanceStatus
  readonly createdAt: string
  readonly stoppedAt?: string
}

/** Create one simulation instance against a configured workspace target. */
export interface CreateSimulationInstanceOptions {
  readonly workspaceId: WorkspaceId
  readonly conversationId: string
  readonly conversationKind?: ImConversationKind
  readonly instanceId?: ImSimulationInstanceId
  readonly speakingMembers?: readonly string[]
}

/** GUI Remote create. Host fills conversation id from the workspace target. */
export interface ImGuiCreateSimulationInstanceOptions {
  readonly workspaceId: WorkspaceId
}

/** GUI Remote member inject. Host fills the external message id. */
export interface ImGuiInjectMemberMessageOptions {
  readonly instanceId: ImSimulationInstanceId
  readonly memberId: string
  readonly text: string
  readonly memberNick?: string
}

/** Inject one speaking-member inbound into a running simulation instance. */
export interface InjectMemberMessageOptions {
  readonly instanceId: ImSimulationInstanceId
  readonly memberId: string
  readonly text: string
  readonly memberNick?: string
  readonly externalMessageId?: string
}

export interface InjectManagedHumanMessageOptions {
  readonly instanceId: ImSimulationInstanceId
  readonly text: string
  readonly humanNick?: string
  readonly externalMessageId?: string
}

export interface ImportJsonlHistoryOptions {
  readonly instanceId: ImSimulationInstanceId
  readonly jsonl: string
}
