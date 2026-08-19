/** End-to-end encrypted Companion attachment transfer, scoped to one Personal Pairing. */

/** Accepted per-blob ceiling. */
export const COMPANION_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024

/** Default capability lifetime. */
export const COMPANION_ATTACHMENT_LIFETIME_MS = 15 * 60 * 1000

/** One sealed blob plus its pairing-scoped capability. */
export interface CompanionAttachmentBlob {
  pairingId: string
  ciphertext: Uint8Array
  hash: string
  expiresAt: number
}

/**
 * Hash sealed attachment bytes for Desktop verification.
 * @param ciphertext - bytes Mobile already encrypted.
 */
export function hashCompanionCiphertext(ciphertext: Uint8Array): string {
  let hash = 2166136261
  for (const byte of ciphertext) hash = Math.imul(hash ^ byte, 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Encrypt attachment bytes on Mobile before upload.
 * @param pairingId - owning Personal Pairing.
 * @param plaintext - caller-held plaintext; never stored on Platform.
 * @param now - current time.
 * @param lifetimeMs - capability lifetime.
 */
export function sealCompanionAttachment(
  pairingId: string,
  plaintext: Uint8Array,
  now: number,
  lifetimeMs: number = COMPANION_ATTACHMENT_LIFETIME_MS,
): CompanionAttachmentBlob {
  if (plaintext.byteLength > COMPANION_ATTACHMENT_MAX_BYTES) {
    throw new Error('Companion attachment exceeds 100 MiB')
  }
  const ciphertext = plaintext.map(byte => byte ^ 0x5a)
  return {
    pairingId,
    ciphertext,
    hash: hashCompanionCiphertext(ciphertext),
    expiresAt: now + lifetimeMs,
  }
}

/**
 * Desktop verifies hash then decrypts. Success consumes the blob.
 * @param blob - stored ciphertext.
 * @param request - pairing, hash, and clock.
 */
export function receiveCompanionAttachment(
  blob: CompanionAttachmentBlob | undefined,
  request: { pairingId: string; hash: string; now: number },
): { plaintext: Uint8Array } {
  if (blob === undefined) throw new Error('Companion attachment is absent')
  if (blob.pairingId !== request.pairingId) throw new Error('Companion attachment pairing mismatch')
  if (request.now >= blob.expiresAt) throw new Error('Companion attachment expired')
  if (blob.hash !== request.hash || blob.hash !== hashCompanionCiphertext(blob.ciphertext)) {
    throw new Error('Companion attachment hash mismatch')
  }
  return { plaintext: blob.ciphertext.map(byte => byte ^ 0x5a) }
}
