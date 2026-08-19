import { describe, expect, it } from 'vitest'
import { parseCompanionOperationId, parseCompanionSessionId } from '@deepseek-ai/dsh-remote-protocol'
import {
  buildCompanionAttachmentOffer,
  COMPANION_ATTACHMENT_MAX_BYTES,
  sealCompanionAttachment,
} from '../src/companion-attachment.ts'

const pairingKey = crypto.getRandomValues(new Uint8Array(32))

describe('Companion encrypted attachments', () => {
  it('encrypts on Mobile with a pairing-derived key and returns the ciphertext hash', async () => {
    const plaintext = new TextEncoder().encode('secret attachment')
    const sealed = await sealCompanionAttachment(pairingKey, plaintext)
    expect(sealed.ciphertext).not.toEqual(plaintext)
    expect(sealed.ciphertextSha256).toMatch(/^[0-9a-f]{64}$/u)

    const offer = buildCompanionAttachmentOffer({
      capability: 'A'.repeat(43) as never,
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: sealed.ciphertext.byteLength,
      expiresAt: 1_000_000 + 900_000,
      fileName: 'notes.txt',
    }, parseCompanionOperationId('operation-one'), parseCompanionSessionId('session-one'))
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

  it('fails the 100 MiB ceiling before any encryption work', async () => {
    await expect(sealCompanionAttachment(pairingKey, new Uint8Array(COMPANION_ATTACHMENT_MAX_BYTES + 1)))
      .rejects.toThrow('100 MiB')
    await expect(sealCompanionAttachment(new Uint8Array(31), Uint8Array.of(1)))
      .rejects.toThrow('at least 32 bytes')
  })
})
