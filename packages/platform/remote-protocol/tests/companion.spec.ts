import { describe, expect, it } from 'vitest'
import {
  createCompanionVersionOffer,
  decodeCompanionMessage,
  decodeCompanionVersionOffer,
  encodeCompanionMessage,
  encodeCompanionVersionOffer,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseCompanionTranscriptEntryId,
  REMOTE_PROTOCOL_LIMITS,
  RemoteProtocolError,
} from '../src/index.ts'

describe('Encrypted Companion Protocol codec', () => {
  it('negotiates the current major before round-tripping an approved operation and Desktop-confirmed result', () => {
    const negotiated = negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile', [2, 1]),
      createCompanionVersionOffer('desktop', [2]),
    )
    expect(negotiated.major).toBe(2)

    const operationId = parseCompanionOperationId('operation-keyless')
    const sessionId = parseCompanionSessionId('session-keyless')
    const operation = {
      type: 'operation',
      operation: {
        type: 'submit-prompt',
        operationId,
        sessionId,
        text: 'continue from Mobile',
      },
    } as const
    expect(decodeCompanionMessage(negotiated, encodeCompanionMessage(negotiated, operation))).toEqual(operation)

    const result = {
      type: 'result',
      result: {
        type: 'confirmed',
        operationId,
        committedAt: 1_787_027_200_000,
        outcome: 'accepted',
      },
    } as const
    expect(decodeCompanionMessage(negotiated, encodeCompanionMessage(negotiated, result))).toEqual(result)
  })

  it('negotiates the immediately preceding major only with every required security capability', () => {
    const mobile = decodeCompanionVersionOffer(encodeCompanionVersionOffer(
      createCompanionVersionOffer('mobile', [1]),
    ))
    const desktop = decodeCompanionVersionOffer(encodeCompanionVersionOffer(
      createCompanionVersionOffer('desktop', [2, 1]),
    ))
    expect(negotiateCompanionProtocol(mobile, desktop).major).toBe(1)

    const weakenedMobile = decodeCompanionVersionOffer(new TextEncoder().encode(JSON.stringify({
      endpoint: 'mobile',
      versions: [{
        major: 1,
        capabilities: ['authenticated-encryption', 'pairing-key-separation'],
      }],
    })))
    expect(() => negotiateCompanionProtocol(weakenedMobile, desktop)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({
        code: 'COMPANION_SECURITY_CAPABILITY_MISSING',
        updateEndpoint: 'mobile',
      }),
    )
  })

  it('falls back to a safe preceding major when the shared current major loses a security capability', () => {
    const mobile = decodeCompanionVersionOffer(json({
      endpoint: 'mobile',
      versions: [
        {
          major: 2,
          capabilities: ['authenticated-encryption', 'pairing-key-separation'],
        },
        {
          major: 1,
          capabilities: ['authenticated-encryption', 'pairing-key-separation', 'replay-protection'],
        },
      ],
    }))
    const desktop = createCompanionVersionOffer('desktop', [2, 1])

    expect(negotiateCompanionProtocol(mobile, desktop).major).toBe(1)
  })

  it('identifies the stale endpoint and exposes no application encoder when majors do not overlap', () => {
    const mobile = createCompanionVersionOffer('mobile', [1])
    const desktop = createCompanionVersionOffer('desktop', [2])
    expect(() => negotiateCompanionProtocol(mobile, desktop)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({
        code: 'COMPANION_UPDATE_REQUIRED',
        updateEndpoint: 'mobile',
      }),
    )
  })

  it('rejects a caller-created object in place of a successful negotiation token', () => {
    const operation = {
      type: 'operation',
      operation: {
        type: 'submit-prompt',
        operationId: parseCompanionOperationId('operation-counterfeit'),
        sessionId: parseCompanionSessionId('session-counterfeit'),
        text: 'must not encode',
      },
    } as const
    expect(() => { Reflect.apply(encodeCompanionMessage, undefined, [{ major: 2 }, operation]) }).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'COMPANION_VERSION_NOT_NEGOTIATED' }),
    )
    for (const counterfeit of [null, 2]) {
      expect(() => { Reflect.apply(encodeCompanionMessage, undefined, [counterfeit, operation]) }).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'COMPANION_VERSION_NOT_NEGOTIATED' }),
      )
    }
  })

  it('round-trips an approved transcript projection and enforces its page ceiling', () => {
    const negotiated = negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    const entries = Array.from({ length: REMOTE_PROTOCOL_LIMITS.transcriptPageEntries }, (_, index) => ({
      type: 'text' as const,
      entryId: parseCompanionTranscriptEntryId(`entry-${String(index)}`),
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      text: `entry ${String(index)}`,
    }))
    const projection = {
      type: 'projection',
      projection: {
        type: 'transcript-page',
        sessionId: parseCompanionSessionId('session-keyless'),
        entries,
      },
    } as const
    expect(decodeCompanionMessage(
      negotiated,
      encodeCompanionMessage(negotiated, projection),
    )).toEqual(projection)

    const oversized = {
      ...projection,
      projection: {
        ...projection.projection,
        entries: [...entries, {
          type: 'text' as const,
          entryId: parseCompanionTranscriptEntryId('entry-over-limit'),
          role: 'assistant' as const,
          text: 'must be rejected',
        }],
      },
    }
    expect(() => encodeCompanionMessage(negotiated, oversized)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
  })

  it('bounds transcript pages at 50 events or 48 KiB of encoded wire bytes', () => {
    const negotiated = negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(REMOTE_PROTOCOL_LIMITS.transcriptPageEntries).toBe(50)
    expect(REMOTE_PROTOCOL_LIMITS.transcriptPageBytes).toBe(48 * 1_024)

    const exactLimit = transcriptPageWithEncodedBytes(negotiated, 50, 48 * 1_024)
    expect(encodeCompanionMessage(negotiated, exactLimit)).toHaveLength(48 * 1_024)
    expect(decodeCompanionMessage(negotiated, encodeCompanionMessage(negotiated, exactLimit))).toEqual(exactLimit)

    const tooManyEntries = transcriptPageWithEncodedBytes(negotiated, 51)
    expect(() => encodeCompanionMessage(negotiated, tooManyEntries)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
    expect(() => decodeCompanionMessage(negotiated, json({ applicationVersion: 2, ...tooManyEntries }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )

    const multibyteBase = transcriptPageWithEncodedBytes(negotiated, 1)
    const baseBytes = encodeCompanionMessage(negotiated, multibyteBase).byteLength
    const firstEntry = multibyteBase.projection.entries[0]
    if (firstEntry === undefined) throw new Error('Multibyte transcript fixture requires one entry')
    const multibyteOverflow = {
      ...multibyteBase,
      projection: {
        ...multibyteBase.projection,
        entries: [{
          ...firstEntry,
          text: '界'.repeat(Math.floor(((48 * 1_024) - baseBytes) / 3) + 1),
        }],
      },
    }
    expect(new TextEncoder().encode(JSON.stringify({ applicationVersion: 2, ...multibyteOverflow })).byteLength).toBeGreaterThan(48 * 1_024)
    expect(() => encodeCompanionMessage(negotiated, multibyteOverflow)).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
    expect(() => decodeCompanionMessage(negotiated, json({ applicationVersion: 2, ...multibyteOverflow }))).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }),
    )
  })

  it('validates version offers before negotiation', () => {
    for (const majors of [[], [1, 1]] as const) {
      expect(() => createCompanionVersionOffer('mobile', majors)).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }

    const malformedOffers = [
      null,
      [],
      'offer',
      { endpoint: 'relay', versions: [{ major: 1, capabilities: [] }] },
      { endpoint: 'mobile', versions: null },
      { endpoint: 'mobile', versions: [] },
      { endpoint: 'mobile', versions: [{ major: 1, capabilities: [] }, { major: 1, capabilities: [] }] },
      { endpoint: 'mobile', versions: [null] },
      { endpoint: 'mobile', versions: [{ major: 1, wrong: [] }] },
      { endpoint: 'mobile', versions: [{ major: 0, capabilities: [] }] },
      { endpoint: 'mobile', versions: [{ major: 3, capabilities: [] }] },
      { endpoint: 'mobile', versions: [{ major: 1, capabilities: null }] },
      { endpoint: 'mobile', versions: [{ major: 1, capabilities: ['replay-protection', 'replay-protection'] }] },
      { endpoint: 'mobile', versions: [{ major: 1, capabilities: ['plaintext'] }] },
      { endpoint: 'mobile', versions: [], extra: true },
    ]
    for (const offer of malformedOffers) {
      expect(() => decodeCompanionVersionOffer(json(offer))).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }
    expect(() => { Reflect.apply(encodeCompanionVersionOffer, undefined, [{
      endpoint: 'mobile', versions: [undefined],
    }]) }).toThrow(
      expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
    )
  })

  it('rejects wrong negotiation roles and identifies either stale endpoint', () => {
    expect(() => negotiateCompanionProtocol(
      createCompanionVersionOffer('desktop'),
      createCompanionVersionOffer('desktop'),
    )).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }))
    expect(() => negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('mobile'),
    )).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }))

    const weakenedDesktop = decodeCompanionVersionOffer(json({
      endpoint: 'desktop',
      versions: [{ major: 2, capabilities: ['authenticated-encryption', 'pairing-key-separation'] }],
    }))
    expect(() => negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile', [2]),
      weakenedDesktop,
    )).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({
      code: 'COMPANION_SECURITY_CAPABILITY_MISSING', updateEndpoint: 'desktop',
    }))

    expect(() => negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile', [2]),
      createCompanionVersionOffer('desktop', [1]),
    )).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({
      code: 'COMPANION_UPDATE_REQUIRED', updateEndpoint: 'desktop',
    }))
  })

  it('rejects unapproved application messages and fields', () => {
    const negotiated = negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    const operationId = 'operation'
    const sessionId = 'session'
    const baseOperation = { type: 'submit-prompt', operationId, sessionId, text: 'continue' }
    const malformed = [
      null,
      [],
      'message',
      { applicationVersion: 1, type: 'operation', operation: baseOperation },
      { applicationVersion: 2, type: 'host-request', operation: baseOperation },
      { applicationVersion: 2, type: 'operation', result: baseOperation },
      { applicationVersion: 2, type: 'operation', operation: null },
      { applicationVersion: 2, type: 'operation', operation: { ...baseOperation, type: 'terminal-input' } },
      { applicationVersion: 2, type: 'operation', operation: { ...baseOperation, extra: true } },
      { applicationVersion: 2, type: 'operation', operation: { ...baseOperation, text: '' } },
      { applicationVersion: 2, type: 'operation', operation: { ...baseOperation, text: 1 } },
      { applicationVersion: 2, type: 'result', result: null },
      { applicationVersion: 2, type: 'result', result: { type: 'pending' } },
      { applicationVersion: 2, type: 'result', result: { type: 'confirmed', operationId, committedAt: 1, outcome: 'accepted', extra: true } },
      { applicationVersion: 2, type: 'result', result: { type: 'confirmed', operationId, committedAt: 1, outcome: 'unknown' } },
      { applicationVersion: 2, type: 'result', result: { type: 'confirmed', operationId, committedAt: -1, outcome: 'accepted' } },
      { applicationVersion: 2, type: 'result', result: { type: 'confirmed', operationId, committedAt: 1.5, outcome: 'accepted' } },
      { applicationVersion: 2, type: 'projection', projection: null },
      { applicationVersion: 2, type: 'projection', projection: { type: 'workspace-admin' } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: null } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [], extra: true } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [null] } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [{ type: 'tool', entryId: 'entry', role: 'assistant', text: '' }] } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [{ type: 'text', entryId: 'entry', role: 'assistant', text: '', extra: true }] } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [{ type: 'text', entryId: 'entry', role: 'system', text: '' }] } },
      { applicationVersion: 2, type: 'projection', projection: { type: 'transcript-page', sessionId, entries: [{ type: 'text', entryId: 'entry', role: 'user', text: 1 }] } },
    ]
    for (const value of malformed) {
      expect(() => decodeCompanionMessage(negotiated, json(value))).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }

    const oversizedEntries = Array.from(
      { length: REMOTE_PROTOCOL_LIMITS.transcriptPageEntries + 1 },
      (_, index) => ({ type: 'text', entryId: `entry-${String(index)}`, role: 'assistant', text: '' }),
    )
    expect(() => decodeCompanionMessage(negotiated, json({
      applicationVersion: 2,
      type: 'projection',
      projection: { type: 'transcript-page', sessionId, entries: oversizedEntries },
    }))).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }))
  })

  it('enforces Companion message and encoded-value ceilings', () => {
    const negotiated = negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(() => encodeCompanionMessage(negotiated, {
      type: 'operation',
      operation: {
        type: 'submit-prompt',
        operationId: parseCompanionOperationId('operation-large'),
        sessionId: parseCompanionSessionId('session-large'),
        text: 'x'.repeat(REMOTE_PROTOCOL_LIMITS.companionMessageBytes),
      },
    })).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }))

    const manyValues = Array.from({ length: 17 }, () => Array.from({ length: 256 }, () => null))
    expect(() => decodeCompanionMessage(negotiated, json({
      applicationVersion: 2, type: 'operation', operation: { type: 'submit-prompt', operationId: 'operation', sessionId: 'session', text: 'x', extra: manyValues },
    }))).toThrow(expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_LIMIT_EXCEEDED' }))
  })

  it('brands only bounded canonical Companion identifiers', () => {
    for (const value of [undefined, '', 'x'.repeat(129), 'not valid']) {
      expect(() => parseCompanionOperationId(value)).toThrow(
        expect.objectContaining<Partial<RemoteProtocolError>>({ code: 'REMOTE_PROTOCOL_INVALID_MESSAGE' }),
      )
    }
  })
})

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function transcriptPageWithEncodedBytes(
  negotiated: ReturnType<typeof negotiateCompanionProtocol>,
  entryCount: number,
  targetBytes?: number,
) {
  const projection = {
    type: 'projection' as const,
    projection: {
      type: 'transcript-page' as const,
      sessionId: parseCompanionSessionId('session-limit'),
      entries: Array.from({ length: entryCount }, (_, index) => ({
        type: 'text' as const,
        entryId: parseCompanionTranscriptEntryId(`entry-${String(index)}`),
        role: 'assistant' as const,
        text: '',
      })),
    },
  }
  if (targetBytes === undefined) return projection
  const baseBytes = encodeCompanionMessage(negotiated, projection).byteLength
  const last = projection.projection.entries.at(-1)
  if (last === undefined || baseBytes > targetBytes) throw new Error('Transcript fixture cannot reach target size')
  last.text = 'x'.repeat(targetBytes - baseBytes)
  return projection
}
