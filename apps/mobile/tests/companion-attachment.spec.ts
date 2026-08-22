import { describe, expect, it } from 'vitest'
import { parseCompanionOperationId, parseCompanionSessionId } from '@deepseek-ai/dsh-remote-protocol'
import {
  buildCompanionAttachmentOffer,
  COMPANION_ATTACHMENT_MAX_BYTES,
  COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES,
  sealCompanionAttachment,
  transferSelectedCompanionAttachment,
} from '../src/companion-attachment.ts'

const pairingKey = crypto.getRandomValues(new Uint8Array(32))
const ready = { foreground: true, socketOpen: true, synchronized: true }
const reconnecting = { foreground: true, socketOpen: true, synchronized: false }

describe('Companion encrypted attachments', () => {
  it('encrypts on Mobile with a pairing-derived key and returns the ciphertext hash', async () => {
    const plaintext = new TextEncoder().encode('secret attachment')
    const sealed = await sealCompanionAttachment(pairingKey, plaintext, ready)
    expect(sealed.ciphertext).not.toEqual(plaintext)
    expect(sealed.ciphertext.byteLength).toBe(plaintext.byteLength + COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES)
    expect(sealed.ciphertextSha256).toMatch(/^[0-9a-f]{64}$/u)

    const offer = buildCompanionAttachmentOffer({
      capability: 'A'.repeat(43) as never,
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: sealed.ciphertext.byteLength,
      expiresAt: 1_000_000 + 900_000,
      fileName: 'notes.txt',
    }, parseCompanionOperationId('operation-one'), parseCompanionSessionId('session-one'), ready)
    expect(offer).toEqual({
      type: 'offer-attachment',
      operationId: 'operation-one',
      sessionId: 'session-one',
      capability: 'A'.repeat(43),
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: sealed.ciphertext.byteLength,
      expiresAt: 1_900_000,
      fileName: 'notes.txt',
    })
  })

  it('rejects plaintext that cannot fit in the ciphertext ceiling after the GCM seal', async () => {
    const limit = 64
    const accepted = await sealCompanionAttachment(
      pairingKey,
      new Uint8Array(limit - COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES),
      ready,
      limit,
    )
    expect(accepted.ciphertext.byteLength).toBe(limit)
    await expect(sealCompanionAttachment(
      pairingKey,
      new Uint8Array(limit - COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES + 1),
      ready,
      limit,
    )).rejects.toThrow('ciphertext blob ceiling')
    expect(COMPANION_ATTACHMENT_MAX_BYTES).toBeGreaterThan(limit)
    await expect(sealCompanionAttachment(new Uint8Array(31), Uint8Array.of(1), ready))
      .rejects.toThrow('at least 32 bytes')
  })

  it('refuses attachment preparation and offers before foreground synchronization', async () => {
    await expect(sealCompanionAttachment(pairingKey, Uint8Array.of(1), reconnecting))
      .rejects.toThrow(/foreground synchronization/)
    expect(() => buildCompanionAttachmentOffer({
      capability: 'A'.repeat(43) as never,
      ciphertextSha256: 'a'.repeat(64),
      byteLength: 29,
      expiresAt: 1_900_000,
      fileName: 'notes.txt',
    }, parseCompanionOperationId('operation-blocked'), parseCompanionSessionId('session-one'), reconnecting))
      .toThrow(/foreground synchronization/)
  })

  it.each([
    ['binary', 'archive.bin', Uint8Array.of(0, 255, 1, 128)],
    ['image', 'pixel.png', Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
    ['text', 'notes.txt', new TextEncoder().encode('real selected text bytes')],
  ])('reads real %s file bytes, uploads only ciphertext, and sends only the capability control message', async (
    _kind,
    name,
    plaintext,
  ) => {
    const uploaded: Uint8Array[] = []
    const sent: unknown[] = []
    const file = {
      name,
      arrayBuffer: async () => plaintext.buffer.slice(
        plaintext.byteOffset,
        plaintext.byteOffset + plaintext.byteLength,
      ),
    }
    const operation = await transferSelectedCompanionAttachment(file, {
      pairingKey,
      origin: 'https://platform.example',
      authorizationHeaders: { authorization: 'Bearer opaque-current-installation-proof' },
      operationId: parseCompanionOperationId(`operation-${_kind}`),
      sessionId: parseCompanionSessionId('session-one'),
      connection: ready,
      fetch: async (input, init) => {
        expect(input).toBe('https://platform.example/v1/remote-attachments')
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer opaque-current-installation-proof')
        expect(headers.get('content-type')).toBe('application/octet-stream')
        const body = new Uint8Array(await new Response(init?.body).arrayBuffer())
        uploaded.push(body)
        expect(body).not.toEqual(plaintext)
        return new Response(JSON.stringify({
          capability: 'A'.repeat(43),
          byteLength: body.byteLength,
          expiresAt: 1_900_000,
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      },
      send: async (offer) => { sent.push(offer) },
    })

    expect(uploaded).toHaveLength(1)
    expect(operation.fileName).toBe(name)
    expect(operation.byteLength).toBe(uploaded[0]?.byteLength)
    expect(sent).toEqual([operation])
    expect(JSON.stringify(sent)).not.toContain(Buffer.from(plaintext).toString('base64'))
    expect(Object.keys(operation).sort()).toEqual([
      'byteLength', 'capability', 'ciphertextSha256', 'expiresAt', 'fileName', 'operationId', 'sessionId', 'type',
    ])
  })
})
