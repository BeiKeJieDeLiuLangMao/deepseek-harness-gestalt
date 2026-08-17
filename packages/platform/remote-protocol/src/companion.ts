import { decodeProtocolJson, encodeProtocolJson } from './boundary.ts'
import { RemoteProtocolError } from './errors.ts'
import { REMOTE_PROTOCOL_LIMITS } from './limits.ts'
import type {
  CompanionMessage,
  CompanionOperation,
  CompanionOperationId,
  CompanionProjection,
  CompanionResult,
  CompanionSecurityCapability,
  CompanionSessionId,
  CompanionTranscriptEntryId,
  CompanionTextTranscriptEntry,
  CompanionVersionDescriptor,
  CompanionVersionOffer,
} from './types.ts'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/
const MAX_IDENTIFIER_CHARACTERS = 128

/** Security properties that both endpoints must preserve at the selected major. */
export const REQUIRED_COMPANION_SECURITY_CAPABILITIES = [
  'authenticated-encryption',
  'pairing-key-separation',
  'replay-protection',
] as const satisfies readonly CompanionSecurityCapability[]

/** Successful application-version negotiation required by Companion application codecs. */
export interface NegotiatedCompanionProtocol {
  /** Selected current or immediately preceding application major. */
  readonly major: 1 | 2
}

const negotiatedProtocols = new WeakSet<object>()

/**
 * Build an endpoint offer for the current or immediately preceding Companion major.
 * @param endpoint - endpoint sending the offer.
 * @param majors - supported majors in preference order.
 * @returns offer whose majors retain every required security property.
 */
export function createCompanionVersionOffer(
  endpoint: 'mobile' | 'desktop',
  majors: readonly (1 | 2)[] = [2, 1],
): CompanionVersionOffer {
  if (majors.length === 0 || new Set(majors).size !== majors.length) {
    throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', 'Companion version offer majors must be non-empty and unique')
  }
  const versions = majors.map<CompanionVersionDescriptor>(major => ({
    major,
    capabilities: [...REQUIRED_COMPANION_SECURITY_CAPABILITIES],
  }))
  return { endpoint, versions }
}

/**
 * Encode application-version metadata without any application plaintext.
 * @param offer - endpoint majors and security properties.
 * @returns bounded version-offer bytes for endpoint encryption.
 */
export function encodeCompanionVersionOffer(offer: CompanionVersionOffer): Uint8Array {
  return encodeProtocolJson(offer, REMOTE_PROTOCOL_LIMITS.companionMessageBytes, 'Companion version offer')
}

/**
 * Decode bounded application-version metadata before application plaintext is admitted.
 * @param encoded - decrypted version-offer bytes from the peer.
 * @returns validated endpoint majors and security properties.
 */
export function decodeCompanionVersionOffer(encoded: Uint8Array): CompanionVersionOffer {
  const record = object(
    decodeProtocolJson(encoded, REMOTE_PROTOCOL_LIMITS.companionMessageBytes, 'Companion version offer'),
    'Companion version offer',
  )
  exactKeys(record, ['endpoint', 'versions'], 'Companion version offer')
  if (record.endpoint !== 'mobile' && record.endpoint !== 'desktop') {
    invalid('Companion version endpoint must be mobile or desktop')
  }
  if (!Array.isArray(record.versions) || record.versions.length === 0) {
    invalid('Companion version offer must contain at least one major')
  }
  const versions = record.versions.map(parseVersionDescriptor)
  if (new Set(versions.map(version => version.major)).size !== versions.length) {
    invalid('Companion version offer majors must be unique')
  }
  return { endpoint: record.endpoint, versions }
}

/**
 * Select the highest shared Companion major only after security capabilities intersect.
 * @param mobile - Mobile endpoint offer.
 * @param desktop - Desktop endpoint offer.
 * @returns capability required to encode application plaintext.
 */
export function negotiateCompanionProtocol(
  mobile: CompanionVersionOffer,
  desktop: CompanionVersionOffer,
): NegotiatedCompanionProtocol {
  if (mobile.endpoint !== 'mobile' || desktop.endpoint !== 'desktop') {
    throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', 'Companion version offers use the wrong endpoints')
  }
  let unsafeEndpoint: 'mobile' | 'desktop' | undefined
  for (const major of [2, 1] as const) {
    const mobileVersion = mobile.versions.find(version => version.major === major)
    const desktopVersion = desktop.versions.find(version => version.major === major)
    if (mobileVersion === undefined || desktopVersion === undefined) continue
    if (!hasRequiredCapabilities(mobileVersion)) {
      unsafeEndpoint ??= 'mobile'
      continue
    }
    if (!hasRequiredCapabilities(desktopVersion)) {
      unsafeEndpoint ??= 'desktop'
      continue
    }
    const negotiated = Object.freeze({ major })
    negotiatedProtocols.add(negotiated)
    return negotiated
  }
  if (unsafeEndpoint !== undefined) {
    throw new RemoteProtocolError(
      'COMPANION_SECURITY_CAPABILITY_MISSING',
      `${capitalize(unsafeEndpoint)} must update before application data is sent`,
      unsafeEndpoint,
    )
  }
  const mobileMax = Math.max(0, ...mobile.versions.map(version => version.major))
  const desktopMax = Math.max(0, ...desktop.versions.map(version => version.major))
  const updateEndpoint = mobileMax <= desktopMax ? 'mobile' : 'desktop'
  throw new RemoteProtocolError('COMPANION_UPDATE_REQUIRED', `${capitalize(updateEndpoint)} must update before application data is sent`, updateEndpoint)
}

/**
 * Parse a Companion operation id at the encrypted wire boundary.
 * @param value - untrusted protocol-native identifier.
 * @returns branded operation identifier.
 */
export function parseCompanionOperationId(value: unknown): CompanionOperationId {
  return parseIdentifier(value, 'Companion operationId') as CompanionOperationId
}

/**
 * Parse a Companion Session projection id without importing Harness Session types.
 * @param value - untrusted protocol-native identifier.
 * @returns branded Companion Session projection identifier.
 */
export function parseCompanionSessionId(value: unknown): CompanionSessionId {
  return parseIdentifier(value, 'Companion sessionId') as CompanionSessionId
}

/**
 * Parse one transcript projection entry id at the encrypted wire boundary.
 * @param value - untrusted protocol-native identifier.
 * @returns branded transcript entry identifier.
 */
export function parseCompanionTranscriptEntryId(value: unknown): CompanionTranscriptEntryId {
  return parseIdentifier(value, 'Companion transcript entryId') as CompanionTranscriptEntryId
}

/**
 * Encode approved application plaintext after Companion negotiation succeeds.
 * @param protocol - successful security-preserving negotiation.
 * @param message - approved operation, projection, or result.
 * @returns bounded plaintext bytes for endpoint encryption.
 */
export function encodeCompanionMessage(
  protocol: NegotiatedCompanionProtocol,
  message: CompanionMessage,
): Uint8Array {
  requireNegotiated(protocol)
  if (message.type === 'projection'
    && message.projection.entries.length > REMOTE_PROTOCOL_LIMITS.transcriptPageEntries) {
    throw new RemoteProtocolError('REMOTE_PROTOCOL_LIMIT_EXCEEDED', 'Companion transcript page exceeds its entry ceiling')
  }
  return encodeProtocolJson(
    { applicationVersion: protocol.major, ...message },
    REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    'Companion message',
  )
}

/**
 * Decode approved application plaintext after endpoint decryption and negotiation.
 * @param protocol - successful security-preserving negotiation.
 * @param encoded - bounded decrypted application bytes.
 * @returns validated approved operation, projection, or result.
 */
export function decodeCompanionMessage(
  protocol: NegotiatedCompanionProtocol,
  encoded: Uint8Array,
): CompanionMessage {
  requireNegotiated(protocol)
  const record = object(
    decodeProtocolJson(encoded, REMOTE_PROTOCOL_LIMITS.companionMessageBytes, 'Companion message'),
    'Companion message',
  )
  if (record.applicationVersion !== protocol.major) invalid('Companion applicationVersion does not match negotiation')
  switch (record.type) {
    case 'operation':
      exactKeys(record, ['applicationVersion', 'type', 'operation'], 'Companion operation message')
      return { type: 'operation', operation: parseOperation(record.operation) }
    case 'projection':
      exactKeys(record, ['applicationVersion', 'type', 'projection'], 'Companion projection message')
      return { type: 'projection', projection: parseProjection(record.projection) }
    case 'result':
      exactKeys(record, ['applicationVersion', 'type', 'result'], 'Companion result message')
      return { type: 'result', result: parseResult(record.result) }
    default:
      invalid('Companion message type is unsupported')
  }
}

function parseOperation(value: unknown): CompanionOperation {
  const record = object(value, 'Companion operation')
  if (record.type !== 'submit-prompt') invalid('Companion operation type is unsupported')
  exactKeys(record, ['type', 'operationId', 'sessionId', 'text'], 'Companion submit-prompt operation')
  if (typeof record.text !== 'string' || record.text.length === 0) invalid('Companion prompt text must be non-empty')
  return {
    type: 'submit-prompt',
    operationId: parseCompanionOperationId(record.operationId),
    sessionId: parseCompanionSessionId(record.sessionId),
    text: record.text,
  }
}

function parseResult(value: unknown): CompanionResult {
  const record = object(value, 'Companion result')
  if (record.type !== 'confirmed') invalid('Companion result type is unsupported')
  exactKeys(record, ['type', 'operationId', 'committedAt', 'outcome'], 'Companion confirmed result')
  if (record.outcome !== 'accepted') invalid('Companion confirmed outcome is unsupported')
  return {
    type: 'confirmed',
    operationId: parseCompanionOperationId(record.operationId),
    committedAt: positiveSafeInteger(record.committedAt, 'Companion committedAt'),
    outcome: 'accepted',
  }
}

function parseProjection(value: unknown): CompanionProjection {
  const record = object(value, 'Companion projection')
  if (record.type !== 'transcript-page') invalid('Companion projection type is unsupported')
  exactKeys(record, ['type', 'sessionId', 'entries'], 'Companion transcript-page projection')
  if (!Array.isArray(record.entries)) invalid('Companion transcript entries must be an array')
  if (record.entries.length > REMOTE_PROTOCOL_LIMITS.transcriptPageEntries) {
    throw new RemoteProtocolError('REMOTE_PROTOCOL_LIMIT_EXCEEDED', 'Companion transcript page exceeds its entry ceiling')
  }
  return {
    type: 'transcript-page',
    sessionId: parseCompanionSessionId(record.sessionId),
    entries: record.entries.map(parseTranscriptEntry),
  }
}

function parseTranscriptEntry(value: unknown): CompanionTextTranscriptEntry {
  const record = object(value, 'Companion transcript entry')
  if (record.type !== 'text') invalid('Companion transcript entry type is unsupported')
  exactKeys(record, ['type', 'entryId', 'role', 'text'], 'Companion text transcript entry')
  if (record.role !== 'user' && record.role !== 'assistant') invalid('Companion transcript role is unsupported')
  if (typeof record.text !== 'string') invalid('Companion transcript text must be a string')
  return {
    type: 'text',
    entryId: parseCompanionTranscriptEntryId(record.entryId),
    role: record.role,
    text: record.text,
  }
}

function hasRequiredCapabilities(version: CompanionVersionDescriptor): boolean {
  return REQUIRED_COMPANION_SECURITY_CAPABILITIES.every(capability => version.capabilities.includes(capability))
}

function parseVersionDescriptor(value: unknown): CompanionVersionDescriptor {
  const record = object(value, 'Companion version descriptor')
  exactKeys(record, ['major', 'capabilities'], 'Companion version descriptor')
  if (record.major !== 1 && record.major !== 2) invalid('Companion major must be current or immediately preceding')
  if (!Array.isArray(record.capabilities)) invalid('Companion capabilities must be an array')
  const capabilities = record.capabilities.map(parseSecurityCapability)
  if (new Set(capabilities).size !== capabilities.length) invalid('Companion security capabilities must be unique')
  return { major: record.major, capabilities }
}

function parseSecurityCapability(value: unknown): CompanionSecurityCapability {
  if (value === 'authenticated-encryption' || value === 'pairing-key-separation' || value === 'replay-protection') {
    return value
  }
  invalid('Companion security capability is unsupported')
}

function requireNegotiated(protocol: unknown): asserts protocol is NegotiatedCompanionProtocol {
  if (typeof protocol !== 'object' || protocol === null || !negotiatedProtocols.has(protocol)) {
    throw new RemoteProtocolError('COMPANION_VERSION_NOT_NEGOTIATED', 'Companion application data requires successful negotiation')
  }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${name} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(record: Record<string, unknown>, keys: readonly unknown[], name: string): void {
  const supported = keys.filter((key): key is string => typeof key === 'string')
  const actual = Object.keys(record)
  if (actual.length !== supported.length || actual.some(key => !supported.includes(key))) {
    invalid(`${name} contains unsupported fields`)
  }
}

function parseIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTIFIER_CHARACTERS
    || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`${name} must be 1-${String(MAX_IDENTIFIER_CHARACTERS)} base64url characters`)
  }
  return value
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid(`${name} must be a positive safe integer`)
  return value as number
}

function invalid(message: string): never {
  throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', message)
}

function capitalize(value: 'mobile' | 'desktop'): 'Mobile' | 'Desktop' {
  return value === 'mobile' ? 'Mobile' : 'Desktop'
}
