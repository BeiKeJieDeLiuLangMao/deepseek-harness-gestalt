import { describe, expect, it } from 'vitest'
import {
  COMPANION_ATTACHMENT_LIFETIME_MS,
  COMPANION_ATTACHMENT_MAX_BYTES,
  hashCompanionCiphertext,
  receiveCompanionAttachment,
  sealCompanionAttachment,
} from '../src/companion-attachment.ts'

const now = 1_000_000

describe('Companion encrypted attachments', () => {
  it('encrypts on Mobile and decrypts on Desktop only after hash verification', () => {
    const plaintext = Uint8Array.from([1, 2, 3, 4])
    const blob = sealCompanionAttachment('pair-a', plaintext, now)
    expect(blob.ciphertext).not.toEqual(plaintext)
    expect(blob.hash).toBe(hashCompanionCiphertext(blob.ciphertext))
    expect(receiveCompanionAttachment(blob, { pairingId: 'pair-a', hash: blob.hash, now }).plaintext)
      .toEqual(plaintext)
  })

  it('fails closed on cross-pairing, hash mismatch, expiry, and size limit', () => {
    const blob = sealCompanionAttachment('pair-a', Uint8Array.of(9), now)
    expect(() => receiveCompanionAttachment(blob, { pairingId: 'pair-b', hash: blob.hash, now }))
      .toThrow('pairing mismatch')
    expect(() => receiveCompanionAttachment(blob, { pairingId: 'pair-a', hash: 'deadbeef', now }))
      .toThrow('hash mismatch')
    expect(() => receiveCompanionAttachment(blob, {
      pairingId: 'pair-a', hash: blob.hash, now: now + COMPANION_ATTACHMENT_LIFETIME_MS,
    })).toThrow('expired')
    expect(() => receiveCompanionAttachment(undefined, { pairingId: 'pair-a', hash: 'x', now }))
      .toThrow('absent')
    expect(() => sealCompanionAttachment('pair-a', new Uint8Array(COMPANION_ATTACHMENT_MAX_BYTES + 1), now))
      .toThrow('100 MiB')
  })
})
