import {
  decodeProtocolBase64Url,
  decodeProtocolJson,
  encodeProtocolBase64Url,
  encodeProtocolJson,
} from './boundary.ts'
import { RemoteProtocolError } from './errors.ts'
import { REMOTE_PROTOCOL_LIMITS } from './limits.ts'
import type { RelayAttachmentId, RelayErrorCode, RelayMessage, RelayRouteId } from './types.ts'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/
const MAX_IDENTIFIER_CHARACTERS = 128

/**
 * Parse an opaque Relay route identifier at the wire boundary.
 * @param value - untrusted route identifier.
 * @returns branded route identifier.
 */
export function parseRelayRouteId(value: unknown): RelayRouteId {
  return parseIdentifier(value, 'routeId') as RelayRouteId
}

/**
 * Parse an opaque live-attachment identifier at the wire boundary.
 * @param value - untrusted attachment identifier.
 * @returns branded attachment identifier.
 */
export function parseRelayAttachmentId(value: unknown): RelayAttachmentId {
  return parseIdentifier(value, 'attachmentId') as RelayAttachmentId
}

/**
 * Encode one Relay Transport Protocol message without inspecting ciphertext.
 * @param message - validated transport-only message.
 * @returns UTF-8 JSON wire bytes.
 */
export function encodeRelayMessage(message: RelayMessage): Uint8Array {
  switch (message.type) {
    case 'attach':
      return encode({ ...message })
    case 'ciphertext':
      if (message.ciphertext.byteLength > REMOTE_PROTOCOL_LIMITS.ciphertextBytes) {
        throw new RemoteProtocolError('REMOTE_PROTOCOL_LIMIT_EXCEEDED', 'Relay ciphertext exceeds its byte ceiling')
      }
      return encode({ ...message, ciphertext: encodeProtocolBase64Url(message.ciphertext) })
    case 'error':
      return encode({ ...message })
    case 'heartbeat':
      return encode({ ...message })
    case 'revoke':
      return encode({ ...message })
    default:
      return assertNever(message)
  }
}

/**
 * Decode one Relay Transport Protocol message and reject application fields.
 * @param encoded - untrusted UTF-8 JSON wire bytes.
 * @returns validated transport-only message.
 */
export function decodeRelayMessage(encoded: Uint8Array): RelayMessage {
  try {
    const value = decodeProtocolJson(encoded, REMOTE_PROTOCOL_LIMITS.relayMessageBytes, 'Relay message')
    const record = object(value, 'Relay message')
    requireTransportVersion(record)
    switch (record.type) {
      case 'attach':
        exactKeys(record, ['type', 'transportVersion', 'routeId', 'attachmentId', 'endpoint'], 'Relay attach message')
        if (record.endpoint !== 'mobile' && record.endpoint !== 'desktop') invalid('Relay endpoint must be mobile or desktop')
        return {
          type: 'attach', transportVersion: 1,
          routeId: parseRelayRouteId(record.routeId),
          attachmentId: parseRelayAttachmentId(record.attachmentId),
          endpoint: record.endpoint,
        }
      case 'ciphertext':
        exactKeys(record, ['type', 'transportVersion', 'routeId', 'sourceAttachmentId', 'targetAttachmentId', 'ciphertext'], 'Relay ciphertext message')
        return {
          type: 'ciphertext', transportVersion: 1,
          routeId: parseRelayRouteId(record.routeId),
          sourceAttachmentId: parseRelayAttachmentId(record.sourceAttachmentId),
          targetAttachmentId: parseRelayAttachmentId(record.targetAttachmentId),
          ciphertext: decodeProtocolBase64Url(
            record.ciphertext,
            REMOTE_PROTOCOL_LIMITS.ciphertextBytes,
            'Relay ciphertext',
          ),
        }
      case 'heartbeat':
        exactKeys(record, ['type', 'transportVersion', 'attachmentId', 'sentAt'], 'Relay heartbeat message')
        return {
          type: 'heartbeat', transportVersion: 1,
          attachmentId: parseRelayAttachmentId(record.attachmentId),
          sentAt: positiveSafeInteger(record.sentAt, 'Relay heartbeat sentAt'),
        }
      case 'revoke':
        exactKeys(record, ['type', 'transportVersion', 'routeId', 'attachmentId', 'reason'], 'Relay revoke message')
        if (record.reason !== 'device' && record.reason !== 'all' && record.reason !== 'disabled') {
          invalid('Relay revocation reason is unsupported')
        }
        return {
          type: 'revoke', transportVersion: 1,
          routeId: parseRelayRouteId(record.routeId),
          attachmentId: parseRelayAttachmentId(record.attachmentId),
          reason: record.reason,
        }
      case 'error': {
        const keys = record.retryAfterMs === undefined
          ? ['type', 'transportVersion', 'code']
          : ['type', 'transportVersion', 'code', 'retryAfterMs']
        exactKeys(record, keys, 'Relay error message')
        if (!isRelayErrorCode(record.code)) invalid('Relay error code is unsupported')
        return {
          type: 'error', transportVersion: 1, code: record.code,
          ...(record.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: positiveSafeInteger(record.retryAfterMs, 'Relay retryAfterMs') }),
        }
      }
      default:
        invalid('Relay message type is unsupported')
    }
  } catch (error) {
    if (error instanceof RemoteProtocolError) throw error
    throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', 'Relay message is not valid protocol JSON')
  }
}

/**
 * Negotiate the highest shared Relay Transport major independently from Companion versions.
 * @param localVersions - locally implemented transport majors.
 * @param remoteVersions - peer transport majors.
 * @returns the selected transport major.
 */
export function negotiateRelayTransportVersion(
  localVersions: readonly number[],
  remoteVersions: readonly number[],
): 1 {
  if (localVersions.includes(1) && remoteVersions.includes(1)) return 1
  throw new RemoteProtocolError('RELAY_TRANSPORT_INCOMPATIBLE', 'Relay Transport Protocol has no supported version overlap')
}

function parseIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTIFIER_CHARACTERS
    || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`${name} must be 1-${String(MAX_IDENTIFIER_CHARACTERS)} base64url characters`)
  }
  return value
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], name: string): void {
  const actual = Object.keys(record)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
    invalid(`${name} contains unsupported fields`)
  }
}

function encode(value: Record<string, unknown>): Uint8Array {
  return encodeProtocolJson(value, REMOTE_PROTOCOL_LIMITS.relayMessageBytes, 'Relay message')
}

function requireTransportVersion(record: Record<string, unknown>): void {
  if (record.transportVersion !== 1) invalid('Relay transportVersion must be 1')
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid(`${name} must be a positive safe integer`)
  return value as number
}

function isRelayErrorCode(value: unknown): value is RelayErrorCode {
  return value === 'PLATFORM_CAPACITY'
    || value === 'RELAY_ATTACHMENT_REJECTED'
    || value === 'RELAY_ROUTE_REVOKED'
    || value === 'RELAY_SLOW_CONSUMER'
    || value === 'RELAY_TRANSPORT_INCOMPATIBLE'
}

function invalid(message: string): never {
  throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', message)
}

function assertNever(_value: never): never {
  invalid('Relay message type is unsupported')
}
