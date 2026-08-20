/**
 * Provider-neutral Browser Runtime identities and page states.
 * @module @deepseek-ai/dsh-browser-runtime/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identity of a Browser Profile. */
export type BrowserProfileId = Branded<'BrowserProfileId'>
/** User-chosen name of a persistent Browser Profile. */
export type BrowserProfileName = Branded<'BrowserProfileName'>
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
 * Brand a raw string as a user-chosen persistent Browser Profile name.
 * @param name - Caller-visible Profile name.
 * @returns the branded name.
 */
export const BrowserProfileName = (name: string): BrowserProfileName => name as BrowserProfileName
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

/** Complete identity required to address one tab. */
export interface BrowserTarget {
  readonly profileId: BrowserProfileId
  readonly workspaceId: BrowserWorkspaceId
  readonly browserId: BrowserInstanceId
  readonly tabId: BrowserTabId
}

/** How a create request attaches a new tab to an existing hierarchy. */
export type BrowserCreateAttach =
  | { readonly kind: 'workspace'; readonly workspaceId: BrowserWorkspaceId }
  | { readonly kind: 'browser'; readonly workspaceId: BrowserWorkspaceId; readonly browserId: BrowserInstanceId }

/** Preferred Dock width in pixels for one Session-owned Browser Workspace. */
export type BrowserDockWidth = number

/** Kind of Browser Profile storage a Provider committed. */
export type BrowserProfileKind = 'temporary' | 'persistent'

/** Who last recorded ownership of one open or unavailable Browser Workspace tab. The lock is the revision, not this field. */
export type BrowserControlOwner = 'agent' | 'human'

/** Address-field chrome facts for one committed Browser Profile. Temporary Profiles omit a label. */
export interface BrowserProfileChrome {
  readonly kind: BrowserProfileKind
  readonly name?: BrowserProfileName
  readonly partition: string
}

/**
 * Partition-backed identity facts. Isolation is the Chromium partition on
 * `chrome.partition`. Fields stay empty unless a Provider observed them.
 */
export interface BrowserProfileStorage {
  readonly cookies: string
  readonly localStorage: string
  readonly indexedDb: string
  readonly cache: string
  readonly serviceWorker: string
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
  readonly controlOwner: BrowserControlOwner
  readonly chrome: BrowserProfileChrome
  readonly storage: BrowserProfileStorage
}

/** Terminal state retained after the temporary Profile closes. */
export interface BrowserClosedState {
  readonly status: 'closed'
  readonly target: BrowserTarget
  readonly revision: number
}

/** Recoverable or terminal Provider availability loss for an existing target. */
export interface BrowserUnavailableState {
  readonly status: 'unavailable'
  readonly target: BrowserTarget
  readonly revision: number
  readonly reason: 'crashed' | 'unhealthy' | 'reconnect-failed'
  readonly reconnecting: boolean
  readonly controlOwner: BrowserControlOwner
}

/** Observable Browser Runtime state. */
export type BrowserRuntimeState = BrowserPageState | BrowserUnavailableState | BrowserClosedState

/** Deterministic screenshot bytes and the page facts they depict. */
export interface BrowserScreenshot {
  readonly target: BrowserTarget
  readonly revision: number
  readonly url: string
  readonly title: string
  readonly mediaType: 'image/png'
  readonly data: string
}

/** Request to create one temporary Browser Profile and its initial tab. */
export interface BrowserTemporaryCreateRequest {
  readonly profile: 'temporary'
  readonly attach?: BrowserCreateAttach
  readonly signal?: AbortSignal
}

/** Request to create or reopen one named persistent Browser Profile. */
export interface BrowserPersistentCreateRequest {
  readonly profile: 'persistent'
  readonly name: BrowserProfileName
  readonly attach?: BrowserCreateAttach
  readonly signal?: AbortSignal
}

/** Request to create a temporary or named persistent Browser Profile. */
export type BrowserCreateRequest = BrowserTemporaryCreateRequest | BrowserPersistentCreateRequest

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

/**
 * Human pointer or keyboard mutation against one open tab. Omitting `url` and
 * `text` still advances the revision and records reported human ownership, which
 * is how a click or keypress without a URL change stays visible to a later Agent.
 */
export interface BrowserInputRequest extends BrowserMutationRequest {
  readonly url?: string
  readonly text?: string
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
  | 'BROWSER_PROFILE_BUSY'
  | 'BROWSER_PROFILE_NAME'
  | 'BROWSER_SESSION_MISMATCH'
  | 'BROWSER_TRANSFER_UNSUPPORTED'
  | 'BROWSER_PROTOCOL'
  | 'BROWSER_REVISION_CONFLICT'
  | 'BROWSER_RUNTIME_UNAVAILABLE'
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
