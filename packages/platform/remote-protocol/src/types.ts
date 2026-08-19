import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque Relay routing identifier with no application-domain meaning. */
export type RelayRouteId = Branded<'RelayRouteId'>

/** Opaque identifier for one live Relay attachment. */
export type RelayAttachmentId = Branded<'RelayAttachmentId'>

/** Exactly 256 bits of transport attachment authority in canonical base64url form. */
export type RelayCredential = Branded<'RelayCredential'>

/** Protocol-native identifier for one Desktop-authoritative operation. */
export type CompanionOperationId = Branded<'CompanionOperationId'>

/** Protocol-native identifier for an approved Session projection or operation target. */
export type CompanionSessionId = Branded<'CompanionSessionId'>

/** Protocol-native identifier for one ordered transcript projection entry. */
export type CompanionTranscriptEntryId = Branded<'CompanionTranscriptEntryId'>

/** Security property required for a Companion major to remain negotiable. */
export type CompanionSecurityCapability =
  | 'authenticated-encryption'
  | 'pairing-key-separation'
  | 'replay-protection'

/** One supported Companion major and the security properties it preserves. */
export interface CompanionVersionDescriptor {
  major: 1 | 2
  capabilities: readonly CompanionSecurityCapability[]
}

/** Application-version offer exchanged before application plaintext. */
export interface CompanionVersionOffer {
  endpoint: 'mobile' | 'desktop'
  versions: readonly CompanionVersionDescriptor[]
}

/** Approved prompt submission to one opaque Companion Session target. */
export interface CompanionSubmitPromptOperation {
  type: 'submit-prompt'
  operationId: CompanionOperationId
  sessionId: CompanionSessionId
  text: string
}

/** Reconnect query for the Desktop-authoritative outcome of one transmitted operation. */
export interface CompanionQueryOperationStatusOperation {
  type: 'query-operation-status'
  operationId: CompanionOperationId
}

/** Operations in the implemented Companion codec slices. */
export type CompanionOperation = CompanionSubmitPromptOperation | CompanionQueryOperationStatusOperation

/** Desktop-authoritative mutation result. */
export interface CompanionConfirmedResult {
  type: 'confirmed'
  operationId: CompanionOperationId
  committedAt: number
  outcome: 'accepted'
}

/** Reconnect answer returning the original committed result for one operation id. */
export interface CompanionCommittedStatusResult {
  type: 'status'
  operationId: CompanionOperationId
  committed: CompanionConfirmedResult
}

/** Reconnect answer stating the queried operation id committed nothing. */
export interface CompanionAbsentStatusResult {
  type: 'status'
  operationId: CompanionOperationId
  absent: true
}

/** Results in the implemented Companion codec slices. */
export type CompanionResult =
  | CompanionConfirmedResult
  | CompanionCommittedStatusResult
  | CompanionAbsentStatusResult

/** Bounded plain-text transcript entry approved for Mobile presentation. */
export interface CompanionTextTranscriptEntry {
  type: 'text'
  entryId: CompanionTranscriptEntryId
  role: 'user' | 'assistant'
  text: string
}

/** Approved transcript page projected by the Paired Desktop. */
export interface CompanionTranscriptPageProjection {
  type: 'transcript-page'
  sessionId: CompanionSessionId
  entries: readonly CompanionTextTranscriptEntry[]
}

/** Projections in the first implemented Companion codec slice. */
export type CompanionProjection = CompanionTranscriptPageProjection

/** Version-tagged encrypted application plaintext before endpoint encryption. */
export type CompanionMessage =
  | { type: 'operation'; operation: CompanionOperation }
  | { type: 'projection'; projection: CompanionProjection }
  | { type: 'result'; result: CompanionResult }

/** Relay-visible ciphertext forwarding frame. */
export interface RelayCiphertextMessage {
  /** Transport-only discriminant. */
  type: 'ciphertext'
  /** Independently negotiated Relay Transport major. */
  transportVersion: 1
  /** Opaque route selected by the sender. */
  routeId: RelayRouteId
  /** Live attachment that supplied the ciphertext. */
  sourceAttachmentId: RelayAttachmentId
  /** Live attachment that should receive the ciphertext. */
  targetAttachmentId: RelayAttachmentId
  /** Application ciphertext that Relay must not interpret. */
  ciphertext: Uint8Array
}

/** Relay attachment request for one outbound endpoint connection. */
export interface RelayAttachMessage {
  type: 'attach'
  transportVersion: 1
  routeId: RelayRouteId
  attachmentId: RelayAttachmentId
  endpoint: 'mobile' | 'desktop'
  /** High-entropy route authority proved inside the TLS-protected attachment message. */
  credential: RelayCredential
}

/** Content-free liveness frame for one Relay attachment. */
export interface RelayHeartbeatMessage {
  type: 'heartbeat'
  transportVersion: 1
  attachmentId: RelayAttachmentId
  sentAt: number
}

/** Content-free confirmation that Platform authenticated and registered one attachment. */
export interface RelayReadyMessage {
  type: 'ready'
  transportVersion: 1
  attachmentId: RelayAttachmentId
}

/** Content-free revocation frame for one Relay attachment. */
export interface RelayRevokeMessage {
  type: 'revoke'
  transportVersion: 1
  routeId: RelayRouteId
  attachmentId: RelayAttachmentId
  reason: 'device' | 'all' | 'disabled'
}

/** Stable transport failures that never carry application data. */
export type RelayErrorCode =
  | 'PLATFORM_CAPACITY'
  | 'RELAY_ATTACHMENT_REJECTED'
  | 'RELAY_ROUTE_REVOKED'
  | 'RELAY_SLOW_CONSUMER'
  | 'RELAY_TRANSPORT_INCOMPATIBLE'
  | 'REMOTE_OFFLINE'

/** Relay-visible transport failure. */
export interface RelayErrorMessage {
  type: 'error'
  transportVersion: 1
  code: RelayErrorCode
  retryAfterMs?: number
}

/** Relay Transport Protocol messages accepted by the version-one codec. */
export type RelayMessage =
  | RelayAttachMessage
  | RelayCiphertextMessage
  | RelayErrorMessage
  | RelayHeartbeatMessage
  | RelayReadyMessage
  | RelayRevokeMessage
