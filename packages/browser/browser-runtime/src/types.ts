import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identity of a Browser Profile. */
export type BrowserProfileId = Branded<'BrowserProfileId'>
/** Opaque identity of a Browser Workspace inside a Profile. */
export type BrowserWorkspaceId = Branded<'BrowserWorkspaceId'>
/** Opaque identity of one browser instance. */
export type BrowserInstanceId = Branded<'BrowserInstanceId'>
/** Opaque identity of one browser tab. */
export type BrowserTabId = Branded<'BrowserTabId'>

/**
 * Brand a raw string as a Browser Profile identity.
 * @param id - Provider-issued opaque value.
 * @returns the branded identity.
 */
export const BrowserProfileId = (id: string): BrowserProfileId => id as BrowserProfileId
/**
 * Brand a raw string as a Browser Workspace identity.
 * @param id - Provider-issued opaque value.
 * @returns the branded identity.
 */
export const BrowserWorkspaceId = (id: string): BrowserWorkspaceId => id as BrowserWorkspaceId
/**
 * Brand a raw string as a browser-instance identity.
 * @param id - Provider-issued opaque value.
 * @returns the branded identity.
 */
export const BrowserInstanceId = (id: string): BrowserInstanceId => id as BrowserInstanceId
/**
 * Brand a raw string as a browser-tab identity.
 * @param id - Provider-issued opaque value.
 * @returns the branded identity.
 */
export const BrowserTabId = (id: string): BrowserTabId => id as BrowserTabId

/** Complete identity required to address the tracer's one tab. */
export interface BrowserTarget {
  readonly profileId: BrowserProfileId
  readonly workspaceId: BrowserWorkspaceId
  readonly browserId: BrowserInstanceId
  readonly tabId: BrowserTabId
}

/** Open-page facts returned by Browser Runtime operations. */
export interface BrowserPageState {
  readonly status: 'open'
  readonly target: BrowserTarget
  readonly revision: number
  readonly url: string
  readonly title: string
  readonly text: string
  readonly focused: boolean
}

/** Terminal state retained after the temporary Profile closes. */
export interface BrowserClosedState {
  readonly status: 'closed'
  readonly target: BrowserTarget
  readonly revision: number
}

/** Observable Browser Runtime state. */
export type BrowserRuntimeState = BrowserPageState | BrowserClosedState

/** Deterministic screenshot bytes and the page facts they depict. */
export interface BrowserScreenshot {
  readonly target: BrowserTarget
  readonly revision: number
  readonly url: string
  readonly title: string
  readonly mediaType: 'image/png'
  readonly data: string
}

/** Request to create this tracer's temporary Profile and initial tab. */
export interface BrowserCreateRequest {
  readonly profile: 'temporary'
  readonly signal?: AbortSignal
}

/** Mutation request guarded by the caller's last observed revision. */
export interface BrowserMutationRequest {
  readonly target: BrowserTarget
  readonly expectedRevision: number
  readonly signal?: AbortSignal
}

/** Navigate one open tab to a configured URL. */
export interface BrowserNavigateRequest extends BrowserMutationRequest {
  readonly url: string
}

/** Read-only request for one browser target. */
export interface BrowserObserveRequest {
  readonly target: BrowserTarget
  readonly signal?: AbortSignal
}

/** Browser Runtime failure taxonomy. */
export type BrowserRuntimeErrorCode =
  | 'BROWSER_ABORTED'
  | 'BROWSER_CAPACITY'
  | 'BROWSER_DISPOSED'
  | 'BROWSER_NOT_FOUND'
  | 'BROWSER_NOT_OPEN'
  | 'BROWSER_REVISION_CONFLICT'
  | 'BROWSER_UNKNOWN_URL'

/** Failure produced by a Browser Runtime implementation. */
export class BrowserRuntimeError extends Error {
  /**
   * Create one typed Browser Runtime failure.
   * @param message - Human-readable operation failure.
   * @param code - Stable failure category.
   */
  constructor(message: string, readonly code: BrowserRuntimeErrorCode) {
    super(message)
    this.name = 'BrowserRuntimeError'
  }
}
