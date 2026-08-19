import { describe, expect, it } from 'vitest'
import {
  buildApnsPushPayload,
  buildFcmPushMessage,
  COMPANION_PUSH_CATEGORIES,
  COMPANION_PUSH_TITLES,
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

  it('accepts bounded non-whitespace device tokens only', () => {
    expect(parseCompanionPushToken('fcm-registration-token')).toBe('fcm-registration-token')
    expect(() => parseCompanionPushToken('')).toThrow('push token')
    expect(() => parseCompanionPushToken('with space')).toThrow('push token')
    expect(() => parseCompanionPushToken('x'.repeat(4_097))).toThrow('push token')
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
