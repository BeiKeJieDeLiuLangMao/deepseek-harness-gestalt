import { describe, expect, it } from 'vitest'
import {
  COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES,
  deriveCompanionAttachmentKey,
  hashCompanionCiphertext,
  openCompanionAttachment,
  sealCompanionAttachment,
} from '../src/index.ts'

describe('Companion attachment cipher', () => {
  it('rejects undersized pairing keys and truncated ciphertext', async () => {
    await expect(deriveCompanionAttachmentKey(new Uint8Array(31))).rejects.toThrow('at least 32 bytes')
    const key = await deriveCompanionAttachmentKey(new Uint8Array(32))
    await expect(openCompanionAttachment(key, new Uint8Array(12))).rejects.toThrow('truncated')
  })

  it('copies non-plain byte views before touching WebCrypto', async () => {
    const key = await deriveCompanionAttachmentKey(Buffer.alloc(32, 7))
    const sealed = await sealCompanionAttachment(key, Buffer.from('buffered plaintext'))
    expect(sealed.ciphertext.byteLength).toBe(Buffer.byteLength('buffered plaintext') + COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES)
    expect(await hashCompanionCiphertext(Buffer.from(sealed.ciphertext))).toBe(sealed.ciphertextSha256)
    const opened = await openCompanionAttachment(key, Buffer.from(sealed.ciphertext))
    expect(new TextDecoder().decode(opened)).toBe('buffered plaintext')
  })
})
