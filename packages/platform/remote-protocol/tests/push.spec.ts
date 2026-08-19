import { describe, expect, it } from 'vitest'
import {
  buildApnsPushPayload,
  buildFcmPushMessage,
  companionPushHintForEvent,
  COMPANION_PUSH_CATEGORIES,
  COMPANION_PUSH_SESSION_REF_MAX_BYTES,
  COMPANION_PUSH_TITLES,
  COMPANION_PUSH_TOKEN_MAX_BYTES,
  parseCompanionPushCategory,
  parseCompanionPushHint,
  parseCompanionPushToken,
  type CompanionPushHint,
} from '../src/push.ts'
import { parseRelayRouteId } from '../src/relay.ts'

const hint: CompanionPushHint = {
  category: 'approval',
  routeId: parseRelayRouteId('route-one'),
  sessionRef: 'session-one',
}

describe('Companion push hint vocabulary', () => {
  it('round-trips exactly the four generic categories', () => {
    expect(COMPANION_PUSH_CATEGORIES).toEqual(['approval', 'question', 'turn-complete', 'failure'])
    for (const category of COMPANION_PUSH_CATEGORIES) {
      expect(parseCompanionPushCategory(category)).toBe(category)
      expect(COMPANION_PUSH_TITLES[category].length).toBeGreaterThan(0)
    }
    expect(new Set(Object.values(COMPANION_PUSH_TITLES)).size).toBe(COMPANION_PUSH_CATEGORIES.length)
  })

  it('rejects unknown categories, malformed hints, and smuggled fields', () => {
    expect(() => parseCompanionPushCategory('streaming')).toThrow('Companion push category is unsupported')
    expect(() => parseCompanionPushCategory(7)).toThrow('Companion push category is unsupported')
    expect(() => parseCompanionPushHint(null)).toThrow('Companion push hint must be an object')
    expect(() => parseCompanionPushHint(['approval'])).toThrow('Companion push hint must be an object')
    expect(() => parseCompanionPushHint({ category: 'approval' })).toThrow('unsupported fields')
    expect(() => parseCompanionPushHint({ routeId: 'route-one' })).toThrow('unsupported fields')
    expect(() => parseCompanionPushHint({ ...hint, text: 'secret session content' })).toThrow('unsupported fields')
    expect(() => parseCompanionPushHint({ category: 'approval', routeId: 'bad route' })).toThrow('routeId')
    expect(() => parseCompanionPushHint({ category: 'approval', routeId: 'route-one', sessionRef: 'has space' }))
      .toThrow('sessionRef')
    expect(() => parseCompanionPushHint({ category: 'approval', routeId: 'route-one', sessionRef: '' }))
      .toThrow('sessionRef')
    expect(parseCompanionPushHint(hint)).toEqual(hint)
    expect(parseCompanionPushHint({ category: 'failure', routeId: 'route-one' }))
      .toEqual({ category: 'failure', routeId: 'route-one' })
  })

  it('accepts bounded non-whitespace device tokens only, measuring UTF-8 bytes', () => {
    const exactAscii = 'x'.repeat(COMPANION_PUSH_TOKEN_MAX_BYTES)
    expect(parseCompanionPushToken('fcm-registration-token')).toBe('fcm-registration-token')
    expect(parseCompanionPushToken(exactAscii)).toBe(exactAscii)
    expect(() => parseCompanionPushToken('')).toThrow('push token')
    expect(() => parseCompanionPushToken('with space')).toThrow('push token')
    expect(() => parseCompanionPushToken(`${exactAscii}x`)).toThrow('push token')
    const multibyteExact = `${'你'.repeat(1_365)}y`
    expect(new TextEncoder().encode(multibyteExact).byteLength).toBe(COMPANION_PUSH_TOKEN_MAX_BYTES)
    expect(parseCompanionPushToken(multibyteExact)).toBe(multibyteExact)
    expect(() => parseCompanionPushToken(`${multibyteExact}z`)).toThrow('push token')
    expect(() => parseCompanionPushToken('你'.repeat(1_366))).toThrow('push token')
  })

  it('accepts sessionRef at its exact UTF-8 byte ceiling and rejects overflow or multibyte identifiers', () => {
    const sessionRef = 's'.repeat(COMPANION_PUSH_SESSION_REF_MAX_BYTES)
    expect(parseCompanionPushHint({ category: 'failure', routeId: 'route-one', sessionRef }))
      .toEqual({ category: 'failure', routeId: 'route-one', sessionRef })
    expect(() => parseCompanionPushHint({
      category: 'failure',
      routeId: 'route-one',
      sessionRef: `${sessionRef}x`,
    })).toThrow('sessionRef')
    expect(() => parseCompanionPushHint({
      category: 'failure',
      routeId: 'route-one',
      sessionRef: '你',
    })).toThrow('sessionRef')
  })

  it('emits no hint for streaming chunks and a generic hint for the four attention events', () => {
    const routeId = parseRelayRouteId('route-one')
    expect(companionPushHintForEvent({ kind: 'streaming', routeId, sessionRef: 'session-one' }))
      .toBeUndefined()
    expect(companionPushHintForEvent({ kind: 'approval', routeId, sessionRef: 'session-one' }))
      .toEqual({ category: 'approval', routeId, sessionRef: 'session-one' })
    expect(companionPushHintForEvent({ kind: 'question', routeId })?.category).toBe('question')
    expect(companionPushHintForEvent({ kind: 'turn-complete', routeId })?.category).toBe('turn-complete')
    expect(companionPushHintForEvent({ kind: 'failure', routeId })?.category).toBe('failure')
  })

  it('projects APNs and FCM payloads containing only the category and routing reference', () => {
    const apns = buildApnsPushPayload(hint)
    expect(apns).toEqual({
      aps: {
        alert: { title: 'Approval requested' },
        category: 'approval',
        'thread-id': 'route-one',
      },
      routeId: 'route-one',
      sessionRef: 'session-one',
    })
    const fcm = buildFcmPushMessage(hint, parseCompanionPushToken('device-token'))
    expect(fcm).toEqual({
      message: {
        token: 'device-token',
        notification: { title: 'Approval requested' },
        data: { category: 'approval', routeId: 'route-one', sessionRef: 'session-one' },
      },
    })
  })

  it('omits the session reference from both vendor payloads when absent', () => {
    const sessionless: CompanionPushHint = { category: 'question', routeId: parseRelayRouteId('route-two') }
    const apns = buildApnsPushPayload(sessionless)
    const fcm = buildFcmPushMessage(sessionless, parseCompanionPushToken('device-token'))
    expect('sessionRef' in apns).toBe(false)
    expect('sessionRef' in fcm.message.data).toBe(false)
    expect(apns.aps.alert.title).toBe('Question waiting')
    expect(fcm.message.notification.title).toBe('Question waiting')
  })

  it('carries no content-shaped keys anywhere in either vendor payload', () => {
    const forbidden = new Set(['body', 'subtitle', 'text', 'message', 'summary', 'reason', 'arguments', 'prompt'])
    const collect = (value: unknown, keys: string[]): string[] => {
      if (typeof value !== 'object' || value === null) return keys
      if (Array.isArray(value)) return value.reduce((all, item) => collect(item, all), keys)
      return Object.entries(value as Record<string, unknown>).reduce(
        (all, [key, item]) => collect(item, [...all, key]),
        keys,
      )
    }
    for (const category of COMPANION_PUSH_CATEGORIES) {
      const current: CompanionPushHint = { category, routeId: parseRelayRouteId('route-one'), sessionRef: 'session-one' }
      const apnsKeys = collect(buildApnsPushPayload(current), [])
      const fcmMessage = buildFcmPushMessage(current, parseCompanionPushToken('device-token'))
      const fcmKeys = collect(fcmMessage, []).filter(key => key !== 'message')
      expect(apnsKeys.filter(key => forbidden.has(key))).toEqual([])
      expect(fcmKeys.filter(key => forbidden.has(key))).toEqual([])
      const serialized = JSON.stringify([buildApnsPushPayload(current), fcmMessage])
      expect(serialized).not.toContain('session content')
    }
  })
})
