/**
 * Content-free Companion push hints: the generic event categories, the minimal
 * wire hint, and the APNs/FCM payload projections. A hint never carries Session
 * content — only a generic category and an opaque routing reference — so a push
 * provider or Platform intermediary learns nothing beyond "something changed".
 */

import { RemoteProtocolError } from './errors.ts'
import { parseRelayRouteId } from './relay.ts'
import type { CompanionPushToken, RelayRouteId } from './types.ts'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/u
const MAX_IDENTIFIER_CHARACTERS = 128
const MAX_TOKEN_CHARACTERS = 4_096

/** Every generic Companion push category; streaming chunks have no category and never produce a hint. */
export const COMPANION_PUSH_CATEGORIES = ['approval', 'question', 'turn-complete', 'failure'] as const

/** Generic Companion push category disclosed to push providers. */
export type CompanionPushCategory = (typeof COMPANION_PUSH_CATEGORIES)[number]

/** Generic notification title per category; titles repeat the category and nothing else. */
export const COMPANION_PUSH_TITLES: Record<CompanionPushCategory, string> = {
  approval: 'Approval requested',
  question: 'Question waiting',
  'turn-complete': 'Turn completed',
  failure: 'Turn failed',
}

/**
 * One content-free push hint: the generic category plus the opaque routing
 * reference a tap needs to select the correct Paired Desktop and Session after
 * foreground synchronization.
 */
export interface CompanionPushHint {
  category: CompanionPushCategory
  routeId: RelayRouteId
  /** Opaque Session routing reference; absent when the event owns no single Session. */
  sessionRef?: string
}

/**
 * Parse a content-free push hint at a wire boundary. Unknown categories,
 * malformed routing references, and extra fields are rejected, so Session
 * content cannot ride beside the hint.
 * @param value - untrusted wire value.
 * @returns validated push hint.
 */
export function parseCompanionPushHint(value: unknown): CompanionPushHint {
  const record = object(value, 'Companion push hint')
  const keys = Object.keys(record)
  if (!keys.includes('category') || !keys.includes('routeId')
    || keys.some(key => key !== 'category' && key !== 'routeId' && key !== 'sessionRef')) {
    invalid('Companion push hint contains unsupported fields')
  }
  const hint: CompanionPushHint = {
    category: parseCompanionPushCategory(record.category),
    routeId: parseRelayRouteId(record.routeId),
  }
  if (record.sessionRef !== undefined) hint.sessionRef = parseSessionRef(record.sessionRef)
  return hint
}

/**
 * Parse a generic push category at a wire boundary.
 * @param value - untrusted wire value.
 * @returns validated category.
 */
export function parseCompanionPushCategory(value: unknown): CompanionPushCategory {
  if (typeof value !== 'string'
    || !(COMPANION_PUSH_CATEGORIES as readonly string[]).includes(value)) {
    invalid('Companion push category is unsupported')
  }
  return value as CompanionPushCategory
}

/**
 * Parse an opaque device push token at a wire boundary.
 * @param value - untrusted wire value.
 * @returns branded push token.
 */
export function parseCompanionPushToken(value: unknown): CompanionPushToken {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TOKEN_CHARACTERS
    || /\s/u.test(value)) {
    invalid('Companion push token must be 1-4096 non-whitespace characters')
  }
  return value as CompanionPushToken
}

/** Minimal APNs JSON body: generic alert, per-Desktop thread grouping, and the routing reference. */
export interface ApnsPushPayload {
  aps: {
    alert: { title: string }
    category: CompanionPushCategory
    'thread-id': string
  }
  routeId: string
  sessionRef?: string
}

/**
 * Project a hint onto the minimal APNs payload.
 * @param hint - content-free hint.
 * @returns APNs JSON body carrying no Session content.
 */
export function buildApnsPushPayload(hint: CompanionPushHint): ApnsPushPayload {
  const payload: ApnsPushPayload = {
    aps: {
      alert: { title: COMPANION_PUSH_TITLES[hint.category] },
      category: hint.category,
      'thread-id': hint.routeId,
    },
    routeId: hint.routeId,
  }
  if (hint.sessionRef !== undefined) payload.sessionRef = hint.sessionRef
  return payload
}

/** Minimal FCM HTTP v1 message: generic notification plus string-valued routing data. */
export interface FcmPushMessage {
  message: {
    token: string
    notification: { title: string }
    data: { category: CompanionPushCategory; routeId: string; sessionRef?: string }
  }
}

/**
 * Project a hint onto the minimal FCM HTTP v1 message.
 * @param hint - content-free hint.
 * @param token - target device registration token.
 * @returns FCM message carrying no Session content.
 */
export function buildFcmPushMessage(hint: CompanionPushHint, token: CompanionPushToken): FcmPushMessage {
  const data: FcmPushMessage['message']['data'] = { category: hint.category, routeId: hint.routeId }
  if (hint.sessionRef !== undefined) data.sessionRef = hint.sessionRef
  return {
    message: {
      token,
      notification: { title: COMPANION_PUSH_TITLES[hint.category] },
      data,
    },
  }
}

function parseSessionRef(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTIFIER_CHARACTERS
    || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`Companion push sessionRef must be 1-${String(MAX_IDENTIFIER_CHARACTERS)} base64url characters`)
  }
  return value
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${name} must be an object`)
  return value as Record<string, unknown>
}

function invalid(message: string): never {
  throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', message)
}
