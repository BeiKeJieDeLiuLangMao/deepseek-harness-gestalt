/** Companion opaque-file admission owned by the Session Controller Host Remote. */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { ByteAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import type { SessionAdmitAttachmentRequest, SessionAdmitAttachmentValue } from './types.ts'

/** Canonical base64 payload for at most 100 MiB of opaque Companion bytes. */
export const ADMIT_ATTACHMENT_MAX_BASE64_CHARS = Math.ceil(100 * 1024 * 1024 / 3) * 4
/** Display name bound on the wire and recorded on the admitted reference. */
export const ADMIT_ATTACHMENT_MAX_NAME_CHARS = 255
/** Companion operation identity used for Session-log idempotency. */
export const ADMIT_ATTACHMENT_MAX_OPERATION_ID_CHARS = 128
/** Declared media type recorded with the opaque object; bytes are not decoded. */
export const ADMIT_ATTACHMENT_MAX_MEDIA_TYPE_CHARS = 127

const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/

/**
 * Admit exact Companion file bytes onto one Session without sending them to a model.
 * Concurrent `operationId`s for the same Session share the Agent controller's
 * admission chain so collision checks and `session/attachment-admitted` appends
 * serialize at one live Session commit point.
 */
export class SessionAttachmentAdmission {
  /**
   * @param ctx - Host context carrying Agent, attachment, and Session services.
   * @param agents - owner of Session resume and the per-Agent admission chain.
   */
  constructor(
    private readonly ctx: Context,
    private readonly agents: ApiSessionAgentController,
  ) {}

  /**
   * Persist exact opaque bytes, record a log-only admission event, and flush.
   * @param request - Session identity, Companion operation id, declared media type, name, and canonical base64.
   * @returns the durable byte reference already recorded for this operation, or the newly admitted reference.
   */
  async admitAttachment(request: SessionAdmitAttachmentRequest): Promise<SessionAdmitAttachmentValue> {
    const operationId = boundedToken(request.operationId, ADMIT_ATTACHMENT_MAX_OPERATION_ID_CHARS, 'operationId')
    const mediaType = boundedToken(request.mediaType, ADMIT_ATTACHMENT_MAX_MEDIA_TYPE_CHARS, 'mediaType')
    if (!MEDIA_TYPE.test(mediaType)) {
      throw new RemoteError(
        'session/attachment-invalid',
        'File attachment media type is invalid.',
        { reason: 'INVALID_BYTE_MEDIA_TYPE' },
      )
    }
    const name = boundedToken(request.name, ADMIT_ATTACHMENT_MAX_NAME_CHARS, 'name')
    const bytes = decodeCanonicalBase64(request.data)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const found = await this.agents.resolveAgent(request.sessionId)
    if ('error' in found) throw found.error
    return this.agents.serializeImageAdmission(found.agent, async () => {
      const prior = admittedEvent(found.agent.session.snapshotEvents(), operationId)
      if (prior !== undefined) {
        assertMatchingAdmission(prior.data.attachment, {
          sha256,
          bytes: bytes.byteLength,
          mediaType,
          name,
        })
        return { attachment: prior.data.attachment }
      }
      let attachment: ByteAttachmentRef
      try {
        attachment = await this.ctx.attachments.saveBytes({ data: bytes, mediaType, name })
      } catch (error: unknown) {
        if (error instanceof AttachmentError) {
          throw new RemoteError('session/attachment-invalid', error.message, { reason: error.code })
        }
        throw new RemoteError('gateway/internal', 'Unable to admit file attachment.', {})
      }
      found.agent.session.append('session/attachment-admitted', {
        attachment,
        operationId,
        source: 'companion',
      }, { ignorable: true })
      await this.ctx.sessions.flush(found.agent.session)
      return { attachment }
    })
  }
}

function boundedToken(value: string, max: number, field: string): string {
  if (value.length < 1 || value.length > max) {
    throw new RemoteError(
      'session/attachment-invalid',
      `File attachment ${field} is invalid.`,
      { reason: 'INVALID_ATTACHMENT_REF' },
    )
  }
  return value
}

function decodeCanonicalBase64(data: string): Uint8Array {
  if (data.length < 4 || data.length > ADMIT_ATTACHMENT_MAX_BASE64_CHARS) {
    throw new RemoteError(
      'session/attachment-invalid',
      'File attachment encoding or byte length is invalid.',
      { reason: 'INVALID_ATTACHMENT_REF' },
    )
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(data)) {
    throw new RemoteError(
      'session/attachment-invalid',
      'File attachment encoding or byte length is invalid.',
      { reason: 'INVALID_ATTACHMENT_REF' },
    )
  }
  const bytes = new Uint8Array(Buffer.from(data, 'base64'))
  if (Buffer.from(bytes).toString('base64') !== data) {
    throw new RemoteError(
      'session/attachment-invalid',
      'File attachment encoding or byte length is invalid.',
      { reason: 'INVALID_ATTACHMENT_REF' },
    )
  }
  return bytes
}

function admittedEvent(
  events: readonly SessionEvent[],
  operationId: string,
): Extract<SessionEvent, { readonly type: 'session/attachment-admitted' }> | undefined {
  const found = events.find(event => event.type === 'session/attachment-admitted'
    && event.data.operationId === operationId)
  return found?.type === 'session/attachment-admitted' ? found : undefined
}

function assertMatchingAdmission(
  recorded: ByteAttachmentRef,
  expected: { readonly sha256: string; readonly bytes: number; readonly mediaType: string; readonly name: string },
): void {
  if (recorded.sha256 !== expected.sha256
    || recorded.bytes !== expected.bytes
    || recorded.mediaType !== expected.mediaType
    || recorded.name !== expected.name) {
    throw new RemoteError(
      'session/attachment-invalid',
      'Attachment operation id belongs to different file content.',
      { reason: 'ATTACHMENT_OPERATION_COLLISION' },
    )
  }
}
