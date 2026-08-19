/** Desktop receive path for one end-to-end encrypted Companion attachment. */

import type { PersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  deriveCompanionAttachmentKey,
  hashCompanionCiphertext,
  openCompanionAttachment,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionAttachmentRejectionReason,
  type CompanionOfferAttachmentOperation,
} from '@deepseek-ai/dsh-remote-protocol'

/** Explicit Desktop-side rejection; the reason returns to Mobile in the bounded result. */
export class CompanionAttachmentReceiveError extends Error {
  /** @param reason - protocol-native rejection reason. */
  constructor(readonly reason: CompanionAttachmentRejectionReason, message: string) {
    super(message)
    this.name = 'CompanionAttachmentReceiveError'
  }
}

/** One accepted attachment submitted into the existing Session path. */
export interface ReceivedCompanionAttachment {
  fileName: string
  byteLength: number
}

/**
 * Verify, decrypt, and submit one offered attachment into the existing Session path.
 *
 * Verifies the offered ciphertext hash and byte count before any decryption;
 * a hash mismatch never reaches the decryption key.
 * @param offer - decoded Companion control message from Mobile.
 * @param input - pairing scope, pairing key material, blob download, clock, and Session submit.
 * @returns the submitted attachment values.
 */
export async function receiveCompanionAttachment(
  offer: CompanionOfferAttachmentOperation,
  input: {
    pairingId: PersonalPairingId
    pairingKey: Uint8Array
    now: number
    download: (offer: CompanionOfferAttachmentOperation) => Promise<Uint8Array>
    submit: (attachment: { fileName: string; plaintext: Uint8Array }) => Promise<void> | void
  },
): Promise<ReceivedCompanionAttachment> {
  if (input.now >= offer.expiresAt) {
    throw new CompanionAttachmentReceiveError('expired', 'Companion attachment capability has expired')
  }
  if (offer.byteLength > REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes) {
    throw new CompanionAttachmentReceiveError('limit-exceeded', 'Companion attachment exceeds its blob byte ceiling')
  }
  let ciphertext: Uint8Array
  try {
    ciphertext = await input.download(offer)
  } catch (error) {
    if (error instanceof CompanionAttachmentReceiveError) throw error
    throw new CompanionAttachmentReceiveError('transfer-interrupted', 'Companion attachment transfer was interrupted')
  }
  if (ciphertext.byteLength !== offer.byteLength) {
    throw new CompanionAttachmentReceiveError('hash-mismatch', 'Companion attachment byte count does not match the offer')
  }
  if (await hashCompanionCiphertext(ciphertext) !== offer.ciphertextSha256) {
    throw new CompanionAttachmentReceiveError('hash-mismatch', 'Companion attachment ciphertext hash does not match the offer')
  }
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- tsc resolves CryptoKey via @types/node; oxlint's program misses that global
  const key = await deriveCompanionAttachmentKey(input.pairingKey)
  const plaintext = await openCompanionAttachment(key, ciphertext).catch(() => {
    // AES-GCM authentication failure is the only remaining failure after the hash check.
    throw new CompanionAttachmentReceiveError('hash-mismatch', 'Companion attachment did not authenticate')
  })
  await input.submit({ fileName: offer.fileName, plaintext })
  return { fileName: offer.fileName, byteLength: plaintext.byteLength }
}
