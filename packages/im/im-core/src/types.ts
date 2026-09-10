/**
 * Client-safe type surface of the IM domain: account metadata, credential references,
 * routing rules, trigger settings, and target resolution types.
 *
 * @module @deepseek-ai/dsh-im-core/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Opaque branded identifier of one IM account. */
export type ImAccountId = Branded<'ImAccountId'>

/** Opaque branded identifier of one IM route rule. */
export type ImRouteRuleId = Branded<'ImRouteRuleId'>

/** Supported external IM platform kinds. */
export type ImPlatform = 'dingtalk' | 'wangwang'

/** Connection lifecycle state of an IM account. */
export type ImAccountStatus = 'connected' | 'disconnected' | 'error'

/**
 * Metadata for a connected IM account.
 * Secrets are never stored here; only nominal credential references are kept.
 */
export interface ImAccountMetadata {
  readonly id: ImAccountId
  readonly platform: ImPlatform
  /** Display name or alias for the account. */
  readonly displayName: string
  /** Reference to secret credential in credential provider. Never plaintext secrets. */
  readonly credentialRef?: CredentialRef
  /** Account connection status. */
  readonly status: ImAccountStatus
  /**
   * Account-level pause. When paused, automatic handling and routing are suspended,
   * but manual/simulated actions remain allowed.
   */
  readonly paused: boolean
  /** Optional platform-specific identity facts (e.g. merchantId, corpId). */
  readonly platformMetadata?: Readonly<Record<string, string>>
  readonly createdAt: string
  readonly updatedAt: string
}

/** Conversation kind: direct message or group chat. */
export type ImConversationKind = 'direct' | 'group'

/** Selection target for route rules: all conversations or a specific conversation ID. */
export type ImRouteTarget =
  | { readonly kind: 'all' }
  | { readonly kind: 'specific'; readonly conversationId: string }

/**
 * Group trigger configuration.
 * Multi-select combination of three conditions:
 * 1. mention: triggered when agent is @mentioned
 * 2. everyN: triggered every N new messages (N must be a positive integer)
 * 3. fixedInterval: triggered at fixed interval in seconds if new messages exist (interval must be a positive integer)
 *
 * Validation invariant: at least one condition must be specified for group chats.
 */
export interface ImGroupTriggerConfig {
  readonly mention?: boolean
  readonly everyN?: number
  readonly fixedIntervalSeconds?: number
}

/**
 * Route rule linking an IM account and conversation target to a workspace.
 */
export interface ImRouteRule {
  readonly id: ImRouteRuleId
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly target: ImRouteTarget
  readonly workspaceId: WorkspaceId
  /**
   * Whether automated takeover handling is enabled.
   * Disabling a rule retains its binding to the workspace and prevents fallback to 'all' rules.
   */
  readonly enabled: boolean
  /** Group trigger settings. Required for group conversationKind; undefined for direct. */
  readonly groupTrigger?: ImGroupTriggerConfig
  readonly createdAt: string
  readonly updatedAt: string
}

/** Resolution request for an incoming IM conversation. */
export interface ImResolveRouteRequest {
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly conversationId: string
}

/**
 * Outcome of resolving an IM route rule.
 */
export type ImResolveRouteResult =
  | {
    readonly status: 'matched'
    readonly ruleId: ImRouteRuleId
    readonly workspaceId: WorkspaceId
    readonly enabled: boolean
    readonly groupTrigger?: ImGroupTriggerConfig
  }
  | {
    /** Specific rule matched but is disabled. Retains binding; does not fallback to 'all'. */
    readonly status: 'disabled'
    readonly ruleId: ImRouteRuleId
    readonly workspaceId: WorkspaceId
    readonly groupTrigger?: ImGroupTriggerConfig
  }
  | {
    /** Account paused; automation suspended even if route matched. */
    readonly status: 'account_paused'
    readonly accountId: ImAccountId
    readonly ruleId?: ImRouteRuleId
    readonly workspaceId?: WorkspaceId
  }
  | {
    /** No rule configured; unmatched conversations must not route to sensitive workspaces. */
    readonly status: 'unconfigured'
  }

/**
 * Workspace IM simulation configuration.
 * Simulation target configuration is restricted to configured targets.
 */
export interface ImWorkspaceSimulationConfig {
  readonly workspaceId: WorkspaceId
  readonly targetAccountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly targetConversationId?: string
  readonly updatedAt: string
}

/** Create or replace one IM account record. Secrets never appear here. */
export interface CreateImAccountOptions {
  readonly id: ImAccountId
  readonly platform: ImPlatform
  readonly displayName: string
  readonly credentialRef?: CredentialRef
  readonly status?: ImAccountStatus
  readonly paused?: boolean
  readonly platformMetadata?: Readonly<Record<string, string>>
}

/** Create one takeover route rule. New GUI rules pass `enabled: false`. */
export interface CreateImRouteRuleOptions {
  readonly id: ImRouteRuleId
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly target: ImRouteTarget
  readonly workspaceId: WorkspaceId
  readonly enabled?: boolean
  readonly groupTrigger?: ImGroupTriggerConfig
}

/** Mutable fields of an existing route rule. */
export interface UpdateImRouteRuleOptions {
  readonly workspaceId?: WorkspaceId
  readonly enabled?: boolean
  readonly groupTrigger?: ImGroupTriggerConfig
}

/** Bind a workspace simulation target to a configured account and route. */
export interface SetWorkspaceSimulationTargetOptions {
  readonly workspaceId: WorkspaceId
  readonly targetAccountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly targetConversationId?: string
}
