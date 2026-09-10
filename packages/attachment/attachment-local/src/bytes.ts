/** Opaque byte admission on the shared content-addressed object store. */

import { readFile } from 'node:fs/promises'
import {
  AttachmentError,
  AttachmentId,
} from '@deepseek-ai/dsh-attachment'
import type {
  ByteAttachmentRef,
  SaveByteAttachment,
  StoredByteAttachment,
} from '@deepseek-ai/dsh-attachment'
import { digest, displayName, ensureReference, objectPath, publishObject } from './objects.ts'

const BYTE_MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/

/**
 * Persist exact opaque bytes below a versioned attachment root.
 * @param root - absolute `DSH_HOME/attachments/v1` root.
 * @param input - exact bytes, declared media type, and display name.
 * @param maxBytes - write-time byte cap from validated Config.
 * @returns durable content-addressed byte reference.
 */
export async function saveByteFile(
  root: string,
  input: SaveByteAttachment,
  maxBytes: number,
): Promise<ByteAttachmentRef> {
  if (input.data.byteLength === 0) throw new AttachmentError('Byte attachment is empty.', 'BYTES_EMPTY')
  if (input.data.byteLength > maxBytes) {
    throw new AttachmentError('Byte attachment exceeds the configured byte limit.', 'BYTES_TOO_LARGE')
  }
  if (!BYTE_MEDIA_TYPE.test(input.mediaType)) {
    throw new AttachmentError('Byte attachment media type is invalid.', 'INVALID_BYTE_MEDIA_TYPE')
  }
  const name = displayName(input.name)
  if (name === undefined) throw new AttachmentError('Byte attachment name is invalid.', 'INVALID_BYTE_NAME')
  const sha256 = digest(input.data)
  await publishObject(root, input.data, sha256, 'Unable to persist byte attachment.')
  return {
    attachmentId: AttachmentId(`sha256:${sha256}`),
    mediaType: input.mediaType,
    bytes: input.data.byteLength,
    sha256,
    name,
  }
}

/**
 * Read and verify one content-addressed opaque byte object.
 * @param root - absolute `DSH_HOME/attachments/v1` root.
 * @param ref - reference recorded in the session log.
 * @param signal - optional cancellation for filesystem and verification work.
 * @returns verified bytes and reference.
 * @throws the signal reason when aborted, or an AttachmentError when verification fails.
 */
export async function readByteFile(
  root: string,
  ref: ByteAttachmentRef,
  signal?: AbortSignal,
): Promise<StoredByteAttachment> {
  signal?.throwIfAborted()
  const sha256 = ensureReference(ref)
  if (ref.sha256 !== sha256) {
    throw new AttachmentError('Stored attachment metadata does not match its reference.', 'ATTACHMENT_CORRUPT')
  }
  let data: Uint8Array
  try {
    data = new Uint8Array(await readFile(objectPath(root, sha256), { signal }))
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new AttachmentError('Attachment object is missing.', 'ATTACHMENT_NOT_FOUND')
    }
    throw new AttachmentError('Unable to read byte attachment.', 'ATTACHMENT_READ_FAILED', { cause: error })
  }
  signal?.throwIfAborted()
  if (digest(data) !== sha256 || data.byteLength !== ref.bytes) {
    throw new AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT')
  }
  if (!BYTE_MEDIA_TYPE.test(ref.mediaType)) {
    throw new AttachmentError('Stored attachment metadata does not match its reference.', 'ATTACHMENT_CORRUPT')
  }
  return { ref, data }
}
