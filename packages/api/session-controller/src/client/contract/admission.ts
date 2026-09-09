/**
 * Feature-owned Session admission route and adapter types.
 * Client plugins register exact Session identities or matching adapters so
 * prompt, cancel, queue mutation, and command stay on the Client route
 * instead of stock Host Remote endpoints. Registration does not grant Host
 * authority; titles and ordinary subagent addresses are not credentials.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelSelection, PromptContentPart, QueueAction, SessionRequestId } from '../../types.ts'

type AdmissionFailureFields<Failure extends RemoteFailure> = Failure extends RemoteFailure
  ? Pick<Failure, 'code' | 'message' | 'details'>
  : never

/** Remote failure fields a Client feature may return to the Session admission owner. */
export type SessionAdmissionFailure = AdmissionFailureFields<RemoteFailure>

/** Feature callback result before Session Controller rebuilds its public Remote failure. */
export type SessionAdmissionResult<T> =
  | Extract<RemoteResult<T>, { readonly ok: true }>
  | { readonly ok: false; readonly error: SessionAdmissionFailure }

/** Feature-owned effective model state when Session history cannot project it. */
export interface SessionModelInspection {
  /** Model selection the feature will use for the next request. */
  readonly current: ModelSelection
  /** Whether the feature can currently route that selection. */
  readonly routable: boolean
}

/** Stock model selection for an ordinary Session with durable projection state. */
export interface StockSessionModelRoute {
  readonly kind: 'stock'
  /** Stock selection state comes from the durable Session projection. */
  readonly inspect?: never
  /**
   * Validate and select the next request model.
   * @param selection - requested provider and model.
   * @param signal - optional cancellation for the selection round-trip.
   * @returns the accepted selection, or Remote failure.
   */
  selectModel(
    selection: ModelSelection,
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ selected: ModelSelection }>>
}

/** Feature-owned model inspection and selection for an exact Session identity. */
export interface FeatureSessionModelRoute {
  readonly kind: 'feature'
  /**
   * Read feature-owned selection state that is absent from Session projections.
   * @param signal - optional cancellation for the inspection round-trip.
   * @returns effective selection state, or Remote failure.
   */
  inspect(signal?: AbortSignal): Promise<RemoteResult<SessionModelInspection>>
  /**
   * Validate and select the next request model.
   * @param selection - requested provider and model.
   * @param signal - optional cancellation for the selection round-trip.
   * @returns the accepted selection, or Remote failure.
   */
  selectModel(
    selection: ModelSelection,
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ selected: ModelSelection }>>
}

/** Model route selected by Session ownership. */
export type SessionModelRoute = StockSessionModelRoute | FeatureSessionModelRoute

type AdmissionModelMethod<Method> = Method extends (
  ...args: infer Args
) => Promise<RemoteResult<infer Value>>
  ? (...args: Args) => Promise<SessionAdmissionResult<Value>>
  : never

/** Feature callback model route before Session Controller normalizes failures. */
export type SessionAdmissionModelRoute = {
  [Key in Exclude<keyof FeatureSessionModelRoute, 'kind'>]: AdmissionModelMethod<FeatureSessionModelRoute[Key]>
}

/**
 * Feature-owned admission route for one exact Session identity.
 * Intercepts prompt submission, active turn cancellation, queue mutation,
 * and slash commands on the Client. Callbacks return typed failure fields;
 * Session Controller rebuilds the public RemoteError and classifies throws.
 */
export interface SessionAdmissionRoute {
  /**
   * Admit one prompt with caller-selected queue posture.
   * @param sessionId - target Session identity.
   * @param content - text and temporary image parts.
   * @param mode - 'queue' appends after active turn; 'steer' interrupts it.
   * @param signal - optional cancellation signal for the complete round-trip.
   * @param requestId - local submission identity to preserve in the durable user message.
   * @returns accepted receipt, or Remote failure.
   */
  prompt(
    sessionId: SessionId,
    content: readonly PromptContentPart[],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
    requestId?: SessionRequestId,
  ): Promise<SessionAdmissionResult<{ accepted: true }>>

  /**
   * Stop the active turn while preserving queued inbox items.
   * @param sessionId - target Session identity.
   * @returns accepted receipt, or Remote failure.
   */
  cancel(sessionId: SessionId): Promise<SessionAdmissionResult<{ accepted: true }>>

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
  ): Promise<SessionAdmissionResult<{ accepted: true }>>

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
  ): Promise<SessionAdmissionResult<{ matched: boolean }>>

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
  modelRoute?(sessionId: SessionId): SessionAdmissionModelRoute | undefined

  /**
   * Hide inherited fork seed events from the rendered conversation window.
   * The Client trims the event source using Host follow `inheritedEventCount`. A `session/end-seed` at that cut may hide
   * itself; a later marker does not raise the floor. The durable log and
   * model seed stay intact.
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
