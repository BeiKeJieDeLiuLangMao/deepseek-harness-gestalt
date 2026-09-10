/**
 * RemoteError helpers for IM configuration mutations.
 *
 * @module @deepseek-ai/dsh-im-core/config-errors
 */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ImAccountId, ImConversationKind, ImGroupTriggerConfig, ImRouteRule } from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No IM account carries that id. */
    'im/account-not-found': { readonly accountId: string }
    /** No route rule carries that id. */
    'im/route-not-found': { readonly routeId: string }
    /** A specific conversation is already bound to another workspace. */
    'im/route-conflict': { readonly conversationId: string; readonly workspaceId: string }
    /** Group trigger is missing, empty, or illegal for this conversation kind. */
    'im/invalid-trigger': { readonly reason: string }
    /** Simulation target does not match a configured account or route. */
    'im/simulation-unconfigured': { readonly reason: string }
  }
}

/**
 * True when a group trigger has at least one positive condition.
 * @param trigger - group-trigger config.
 * @returns whether mention, everyN, or fixedIntervalSeconds is a valid condition.
 */
export function hasValidGroupTrigger(trigger: ImGroupTriggerConfig): boolean {
  if (trigger.mention === true) return true
  if (trigger.everyN !== undefined && trigger.everyN > 0) return true
  if (trigger.fixedIntervalSeconds !== undefined && trigger.fixedIntervalSeconds > 0) return true
  return false
}

/**
 * Reject missing accounts at the Remote boundary.
 * @param accountId - missing account identifier.
 * @param message - human-readable failure.
 * @returns `im/account-not-found` RemoteError.
 */
export function accountNotFound(accountId: ImAccountId, message: string): RemoteError {
  return new RemoteError('im/account-not-found', message, { accountId })
}

/**
 * Reject missing route rules at the Remote boundary.
 * @param routeId - missing route identifier.
 * @param message - human-readable failure.
 * @returns `im/route-not-found` RemoteError.
 */
export function routeNotFound(routeId: string, message: string): RemoteError {
  return new RemoteError('im/route-not-found', message, { routeId })
}

/**
 * Reject illegal group triggers at the Remote boundary.
 * @param reason - missing, empty, or direct.
 * @param message - human-readable failure.
 * @returns `im/invalid-trigger` RemoteError.
 */
export function invalidTrigger(reason: string, message: string): RemoteError {
  return new RemoteError('im/invalid-trigger', message, { reason })
}

/**
 * Reject a specific conversation already bound to another workspace.
 * @param conversationId - conversation already bound.
 * @param workspaceId - workspace that currently owns the binding.
 * @returns `im/route-conflict` RemoteError.
 */
export function routeConflict(conversationId: string, workspaceId: string): RemoteError {
  return new RemoteError(
    'im/route-conflict',
    `Conversation ${conversationId} is already bound to workspace ${workspaceId}. Explicit rebind required.`,
    { conversationId, workspaceId },
  )
}

/**
 * Reject a simulation target with no matching route.
 * @param reason - why the target is unconfigured.
 * @param message - human-readable failure.
 * @returns `im/simulation-unconfigured` RemoteError.
 */
export function simulationUnconfigured(reason: string, message: string): RemoteError {
  return new RemoteError('im/simulation-unconfigured', message, { reason })
}

/**
 * Validate group-trigger presence for the conversation kind.
 * @param conversationKind - direct or group.
 * @param groupTrigger - optional trigger payload.
 */
export function assertGroupTrigger(
  conversationKind: ImConversationKind,
  groupTrigger: ImGroupTriggerConfig | undefined,
): void {
  if (conversationKind === 'group') {
    if (!groupTrigger) {
      throw invalidTrigger('missing', 'Group trigger configuration is required for group conversations')
    }
    if (!hasValidGroupTrigger(groupTrigger)) {
      throw invalidTrigger('empty', 'Group trigger must have at least one valid condition with positive numbers')
    }
    return
  }
  if (groupTrigger !== undefined) {
    throw invalidTrigger('direct', 'Group triggers are not allowed for direct conversations')
  }
}

/**
 * Find a conflicting specific-conversation binding, if any.
 * @param rules - existing route rules.
 * @param accountId - account that owns the candidate rule.
 * @param conversationKind - direct or group.
 * @param conversationId - specific conversation being bound.
 * @param exceptId - rule id allowed to keep that conversation.
 * @returns the conflicting rule, or undefined when the conversation is free.
 */
export function conflictingSpecificRoute(
  rules: readonly ImRouteRule[],
  accountId: ImAccountId,
  conversationKind: ImConversationKind,
  conversationId: string,
  exceptId: string,
): ImRouteRule | undefined {
  return rules.find(
    r =>
      r.accountId === accountId
      && r.conversationKind === conversationKind
      && r.target.kind === 'specific'
      && r.target.conversationId === conversationId
      && r.id !== exceptId,
  )
}
