import { describe, expect, it } from 'vitest'
import {
  decodeRelayMessage,
  encodeRelayMessage,
  negotiateRelayTransportVersion,
  parseRelayAttachmentId,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  RemoteProtocolError,
} from '../src/index.ts'

describe('Relay Transport Protocol codec', () => {
  it('round-trips only routing metadata and opaque ciphertext', () => {
    const applicationPlaintext = 'submit the private prompt'
    const encoded = encodeRelayMessage({
      type: 'ciphertext',
      transportVersion: 1,
      routeId: parseRelayRouteId('route-keyless'),
      sourceAttachmentId: parseRelayAttachmentId('mobile-keyless'),
      targetAttachmentId: parseRelayAttachmentId('desktop-keyless'),
      ciphertext: new TextEncoder().encode('opaque-encrypted-bytes'),
    })

    expect(new TextDecoder().decode(encoded)).not.toContain(applicationPlaintext)
    expect(decodeRelayMessage(encoded)).toEqual({
      type: 'ciphertext',
      transportVersion: 1,
      routeId: 'route-keyless',
      sourceAttachmentId: 'mobile-keyless',
      targetAttachmentId: 'desktop-keyless',
      ciphertext: new TextEncoder().encode('opaque-encrypted-bytes'),
    })
  })

  it('admits only attachment, forwarding, heartbeat, revocation, and transport errors', () => {
    const routeId = parseRelayRouteId('route-keyless')
    const attachmentId = parseRelayAttachmentId('mobile-keyless')
    const messages = [
      { type: 'attach', transportVersion: 1, routeId, attachmentId, endpoint: 'mobile' },
      { type: 'attach', transportVersion: 1, routeId, attachmentId, endpoint: 'desktop' },
      { type: 'heartbeat', transportVersion: 1, attachmentId, sentAt: 1_787_027_200_000 },
      { type: 'revoke', transportVersion: 1, routeId, attachmentId, reason: 'device' },
      { type: 'revoke', transportVersion: 1, routeId, attachmentId, reason: 'all' },
      { type: 'revoke', transportVersion: 1, routeId, attachmentId, reason: 'disabled' },
      { type: 'error', transportVersion: 1, code: 'RELAY_ROUTE_REVOKED' },
      { type: 'error', transportVersion: 1, code: 'PLATFORM_CAPACITY', retryAfterMs: 1_000 },
      { type: 'error', transportVersion: 1, code: 'RELAY_ATTACHMENT_REJECTED' },
      { type: 'error', transportVersion: 1, code: 'RELAY_SLOW_CONSUMER' },
      { type: 'error', transportVersion: 1, code: 'RELAY_TRANSPORT_INCOMPATIBLE' },
    ] as const

    for (const message of messages) {
      expect(decodeRelayMessage(encodeRelayMessage(message))).toEqual(message)
    }
    expect(negotiateRelayTransportVersion([1], [1])).toBe(1)

    const forbidden = new TextEncoder().encode(JSON.stringify({
      type: 'attach',
      transportVersion: 1,
      routeId,
      attachmentId,
      endpoint: 'mobile',
      prompt: 'must never reach Relay',
    }))
    expect(() => decodeRelayMessage(forbidden)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
    expect(() => { Reflect.apply(encodeRelayMessage, undefined, [{ type: 'host-request' }]) }).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
  })

  it('fails closed when Relay transport versions do not overlap', () => {
    expect(() => negotiateRelayTransportVersion([1], [2])).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'RELAY_TRANSPORT_INCOMPATIBLE' }),
    )
  })

  it('enforces message, parser-depth, encoded-value, and ciphertext limits before dispatch', () => {
    const overMessageLimit = new Uint8Array(REMOTE_PROTOCOL_LIMITS.relayMessageBytes + 1)
    expect(() => decodeRelayMessage(overMessageLimit)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )

    let deepValue: unknown = 'leaf'
    for (let depth = 0; depth <= REMOTE_PROTOCOL_LIMITS.parserDepth; depth += 1) deepValue = [deepValue]
    const overDepth = new TextEncoder().encode(JSON.stringify({
      type: 'attach', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', endpoint: 'mobile', extra: deepValue,
    }))
    expect(() => decodeRelayMessage(overDepth)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )

    const tooManyValues = new TextEncoder().encode(JSON.stringify({
      type: 'attach', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', endpoint: 'mobile',
      extra: Array.from({ length: REMOTE_PROTOCOL_LIMITS.containerValues + 1 }, () => null),
    }))
    expect(() => decodeRelayMessage(tooManyValues)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )

    expect(() => encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1,
      routeId: parseRelayRouteId('route'),
      sourceAttachmentId: parseRelayAttachmentId('mobile'),
      targetAttachmentId: parseRelayAttachmentId('desktop'),
      ciphertext: new Uint8Array(REMOTE_PROTOCOL_LIMITS.ciphertextBytes + 1),
    })).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
  })

  it('rejects malformed transport fields with stable errors', () => {
    const attach = {
      type: 'attach', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', endpoint: 'mobile',
    }
    const malformed = [
      null,
      [],
      'not-an-object',
      { ...attach, transportVersion: 2 },
      { ...attach, endpoint: 'relay' },
      { ...attach, type: 'host-request' },
      { type: 'attach', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', wrong: 'mobile' },
      { type: 'ciphertext', transportVersion: 1, routeId: 'route', sourceAttachmentId: 'mobile', targetAttachmentId: 'desktop', ciphertext: 1 },
      { type: 'ciphertext', transportVersion: 1, routeId: 'route', sourceAttachmentId: 'mobile', targetAttachmentId: 'desktop', ciphertext: '*' },
      { type: 'heartbeat', transportVersion: 1, attachmentId: 'mobile', sentAt: 1.5 },
      { type: 'heartbeat', transportVersion: 1, attachmentId: 'mobile', sentAt: -1 },
      { type: 'revoke', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', reason: 'unknown' },
      { type: 'error', transportVersion: 1, code: 'UNKNOWN' },
      { type: 'error', transportVersion: 1, code: 'PLATFORM_CAPACITY', retryAfterMs: -1 },
    ]
    for (const value of malformed) {
      expect(() => decodeRelayMessage(json(value))).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }

    expect(() => decodeRelayMessage(Uint8Array.of(0xff))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
    expect(() => decodeRelayMessage(json({
      type: 'ciphertext', transportVersion: 1, routeId: 'route',
      sourceAttachmentId: 'mobile', targetAttachmentId: 'desktop', ciphertext: 'A',
    }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
  })

  it('bounds every encoded JSON value before Relay dispatch', () => {
    const attach = {
      type: 'attach', transportVersion: 1, routeId: 'route', attachmentId: 'mobile', endpoint: 'mobile',
    }
    expect(() => decodeRelayMessage(json({ ...attach, extra: 'x'.repeat(REMOTE_PROTOCOL_LIMITS.stringBytes + 1) }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
    expect(() => decodeRelayMessage(json({
      ...attach,
      extra: Array.from({ length: 17 }, () => Array.from({ length: 256 }, () => null)),
    }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
    expect(() => decodeRelayMessage(json({ ...attach, extra: [null, true, false] }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
    expect(() => decodeRelayMessage(json({
      type: 'ciphertext', transportVersion: 1, routeId: 'route',
      sourceAttachmentId: 'mobile', targetAttachmentId: 'desktop',
      ciphertext: Buffer.alloc(REMOTE_PROTOCOL_LIMITS.ciphertextBytes + 1).toString('base64url'),
    }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
  })

  it('brands only bounded canonical Relay identifiers', () => {
    for (const value of [undefined, '', 'x'.repeat(129), 'not valid']) {
      expect(() => parseRelayRouteId(value)).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }
    expect(parseRelayAttachmentId('attachment_valid-1')).toBe('attachment_valid-1')
  })
})

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}
