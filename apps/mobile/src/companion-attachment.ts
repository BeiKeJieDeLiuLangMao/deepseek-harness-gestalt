/** End-to-end encrypted Companion attachment transfer, scoped to one Personal Pairing. */

import {
  deriveCompanionAttachmentKey,
  REMOTE_PROTOCOL_LIMITS,
  sealCompanionAttachment as sealEndpointAttachment,
  type AttachmentCapability,
  type CompanionOfferAttachmentOperation,
} from '@deepseek-ai/dsh-remote-protocol'

/** Accepted per-blob ceiling. */
export const COMPANION_ATTACHMENT_MAX_BYTES = REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes

/** One sealed blob plus the values Mobile sends in the bounded control message. */
export interface CompanionAttachmentTransfer {
  capability: AttachmentCapability
  ciphertextSha256: string
  byteLength: number
  expiresAt: number
  fileName: string
}

/**
 * Encrypt attachment bytes on Mobile before upload.
 * @param pairingKey - secret bytes supplied by the Personal Pairing layer.
 * @param plaintext - caller-held plaintext; never leaves Mobile unencrypted.
 * @returns sealed transfer values for upload and the bounded control message.
 */
export async function sealCompanionAttachment(
  pairingKey: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array<ArrayBuffer>; ciphertextSha256: string }> {
  if (plaintext.byteLength > COMPANION_ATTACHMENT_MAX_BYTES) {
    throw new Error('Companion attachment exceeds 100 MiB')
  }
  const key = await deriveCompanionAttachmentKey(pairingKey)
  return await sealEndpointAttachment(key, plaintext)
}

/**
 * Build the bounded WSS control message that points Desktop at one uploaded blob.
 * @param transfer - values returned by the Platform blob store after upload.
 * @param operationId - idempotency key for the Desktop mutation.
 * @param sessionId - Companion Session that will receive the attachment.
 */
export function buildCompanionAttachmentOffer(
  transfer: CompanionAttachmentTransfer,
  operationId: CompanionOfferAttachmentOperation['operationId'],
  sessionId: CompanionOfferAttachmentOperation['sessionId'],
): CompanionOfferAttachmentOperation {
  return {
    type: 'offer-attachment',
    operationId,
    sessionId,
    capability: transfer.capability,
    ciphertextSha256: transfer.ciphertextSha256,
    byteLength: transfer.byteLength,
    expiresAt: transfer.expiresAt,
    fileName: transfer.fileName,
  }
}
