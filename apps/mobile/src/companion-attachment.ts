/** End-to-end encrypted Companion attachment transfer, scoped to one Personal Pairing. */

import {
  COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES,
  deriveCompanionAttachmentKey,
  REMOTE_PROTOCOL_LIMITS,
  sealCompanionAttachment as sealEndpointAttachment,
  type AttachmentCapability,
  type CompanionOfferAttachmentOperation,
} from '@deepseek-ai/dsh-remote-protocol'
import { requireCompanionMutation, type CompanionConnectionState } from './companion-mutation.ts'

/** Accepted per-blob ciphertext ceiling. */
export const COMPANION_ATTACHMENT_MAX_BYTES = REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes
/** AES-256-GCM seal overhead applied before comparing plaintext against the ciphertext ceiling. */
export { COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES }

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
 * @param connection - foreground connection and validated synchronization state.
 * @param ciphertextLimit - ciphertext ceiling compared against `plaintext + seal overhead`; defaults to the protocol ceiling.
 * @returns sealed transfer values for upload and the bounded control message.
 */
export async function sealCompanionAttachment(
  pairingKey: Uint8Array,
  plaintext: Uint8Array,
  connection: CompanionConnectionState | undefined,
  ciphertextLimit: number = COMPANION_ATTACHMENT_MAX_BYTES,
): Promise<{ ciphertext: Uint8Array<ArrayBuffer>; ciphertextSha256: string }> {
  requireCompanionMutation(connection, 'attachment')
  if (plaintext.byteLength + COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES > ciphertextLimit) {
    throw new Error('Companion attachment exceeds the ciphertext blob ceiling')
  }
  const key = await deriveCompanionAttachmentKey(pairingKey)
  return await sealEndpointAttachment(key, plaintext)
}

/**
 * Build the bounded WSS control message that points Desktop at one uploaded blob.
 * @param transfer - values returned by the Platform blob store after upload.
 * @param operationId - idempotency key for the Desktop mutation.
 * @param sessionId - Companion Session that will receive the attachment.
 * @param connection - foreground connection and validated synchronization state.
 */
export function buildCompanionAttachmentOffer(
  transfer: CompanionAttachmentTransfer,
  operationId: CompanionOfferAttachmentOperation['operationId'],
  sessionId: CompanionOfferAttachmentOperation['sessionId'],
  connection: CompanionConnectionState | undefined,
): CompanionOfferAttachmentOperation {
  requireCompanionMutation(connection, 'attachment')
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
