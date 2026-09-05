/**
 * Feature-owned Session admission route and adapter types.
 * Client plugins register exact Session identities or matching adapters so
 * prompt, cancel, queue mutation, and command stay on the Client route
 * instead of stock Host Remote endpoints. Registration does not grant Host
 * authority; titles and ordinary subagent addresses are not credentials.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelSelection, PromptContentPart, QueueAction } from '../../types.ts'

/** Model inspection and selection routed for one exact Session identity. */
export interface SessionModelRoute {
  /**
   * Read current selection and advisory catalog.
   * @param signal - optional cancellation for the catalog round-trip.
   * @returns catalog payload, or Remote failure.
   */
  models?(signal?: AbortSignal): Promise<RemoteResult<unknown>>
  /**
   * Validate and select the next request model.
   * @param selection - requested provider and model.
   * @param signal - optional cancellation for the selection round-trip.
   * @returns the accepted selection, or Remote failure.
   */
  selectModel?(
    selection: ModelSelection,
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ selected: ModelSelection }>>
}

/**
 * Feature-owned admission route for one exact Session identity.
 * Intercepts prompt submission, active turn cancellation, queue mutation,
 * and slash commands on the Client.
 */
export interface SessionAdmissionRoute {
  /**
   * Admit one prompt with caller-selected queue posture.
   * @param sessionId - target Session identity.
   * @param content - text and temporary image parts.
   * @param mode - 'queue' appends after active turn; 'steer' interrupts it.
   * @param signal - optional cancellation signal for the complete round-trip.
   * @returns accepted receipt, or Remote failure.
   */
  prompt(
    sessionId: SessionId,
    content: readonly PromptContentPart[],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ accepted: true }>>

  /**
   * Stop the active turn while preserving queued inbox items.
   * @param sessionId - target Session identity.
   * @returns accepted receipt, or Remote failure.
   */
  cancel(sessionId: SessionId): Promise<RemoteResult<{ accepted: true }>>

  /**
   * Mutate one pending queue item through the feature's route.
   * When omitted, queue mutation on this Session fails loud.
   * @param sessionId - target Session identity.
   * @param itemId - queue item identity.
   * @param action - mutation action.
   * @returns accepted receipt, or Remote failure.
   */
  updateQueue?(
    sessionId: SessionId,
    itemId: MessageId,
    action: QueueAction,
  ): Promise<RemoteResult<{ accepted: true }>>

  /**
   * Execute one slash command through the feature's route.
   * When omitted, slash commands on this Session fail loud.
   * Commands are never translated into prompt submissions.
   * @param sessionId - target Session identity.
   * @param line - full command line including leading slash.
   * @returns matched receipt, or Remote failure.
   */
  command?(
    sessionId: SessionId,
    line: string,
  ): Promise<RemoteResult<{ matched: boolean }>>

  /**
   * Resolve the identity whose ordinary command catalog may serve this Session.
   * Omission hides commands for a feature-owned Session. Catalog consumers
   * are not wired in this slice.
   * @param sessionId - target Session identity.
   * @returns the catalog identity, or undefined when commands stay hidden.
   */
  commandCatalogSessionId?(sessionId: SessionId): SessionId | undefined

  /**
   * Resolve the identity whose skill catalog may serve this Session.
   * Omission hides skills. Catalog consumers are not wired in this slice.
   * @param sessionId - target Session identity.
   * @returns the catalog identity, or undefined when skills stay hidden.
   */
  skillCatalogSessionId?(sessionId: SessionId): SessionId | undefined

  /**
   * Route model inspection and selection for this Session.
   * Owning this field replaces stock, including an explicit undefined that
   * hides the selector until detach. Omitting the field is not a hide: an
   * ordinary listed Session keeps the stock Host catalog, and a catalog child
   * stays hidden because Host `session.selectModel` refuses subagent origin.
   * @param sessionId - target Session identity.
   * @returns the feature route, or undefined when model selection stays hidden.
   */
  modelRoute?(sessionId: SessionId): SessionModelRoute | undefined

  /**
   * Hide inherited fork seed events from the rendered conversation window.
   * The Client trims the event source using Host `seedLength`
   * (`inheritedEventCount`) and the last `session/end-seed` seq. The durable
   * log and model seed stay intact.
   */
  readonly historyScope?: 'owned-suffix' | undefined
}

/**
 * Feature-owned admission adapter across matching sessions.
 * Handled sessions route prompt, cancel, updateQueue, and command
 * through this adapter instead of stock Remote endpoints.
 */
export interface SessionAdmissionAdapter extends SessionAdmissionRoute {
  /** Stable registration identity used for duplicate detection and diagnostics. */
  readonly id: string

  /**
   * Whether this adapter owns admission for the exact Session identity.
   * @param sessionId - candidate Session identity.
   * @returns true when this adapter owns the identity.
   */
  handles(sessionId: SessionId): boolean
}

/** Conflict resolution strategy for exact Session admission registration. */
export interface SessionAdmissionOptions {
  /**
   * Conflict strategy when a route already exists for the Session:
   * - 'replace': (default) establishes the new single owner; older disposers will not revoke the new owner.
   * - 'reject': throws an Error if an active route is already registered.
   */
  conflict?: 'replace' | 'reject'
}
