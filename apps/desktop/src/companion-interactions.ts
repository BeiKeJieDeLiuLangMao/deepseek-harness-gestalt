/** Desktop mapping from Gateway `$events` waterfalls to pairing-private Companion identities. */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  RemoteEventClientId,
  RemoteEventDownlinkFrame,
  RemoteEventId,
  RemoteEventReadyFrame,
} from '@deepseek-ai/dsh-api-gateway'
import {
  encodeProtocolBase64Url,
  parseCompanionInteractionId,
  parseCompanionSessionId,
  type CompanionInteractionId,
  type CompanionSessionId,
} from '@deepseek-ai/dsh-remote-protocol'
import type { DesktopPendingCompanionInteraction } from './companion-product.ts'

interface PendingQuestion extends DesktopPendingCompanionInteraction {
  kind: 'question'
  questions: readonly unknown[]
}

interface PendingApproval extends DesktopPendingCompanionInteraction {
  kind: 'approval'
  approvalId: string
  toolName: string
  callId?: string
  reason?: string
}

type PendingInteraction = PendingApproval | PendingQuestion

/** Pairing-neutral Host pending registry; ids are derived only when projected to one pairing. */
export class DesktopCompanionInteractionRegistry {
  private clientId: RemoteEventClientId | undefined
  private readonly pending = new Map<RemoteEventId, PendingInteraction>()

  /** Bind later `$events/result` calls to this Client generation. */
  ready(frame: RemoteEventReadyFrame): void {
    this.clientId = frame.clientId
    this.pending.clear()
  }

  /** @param frame - validated Gateway forwarded-event item. */
  accept(frame: RemoteEventDownlinkFrame): void {
    if (frame.type === 'cancel') {
      this.pending.delete(frame.eventId)
      return
    }
    if (frame.type !== 'waterfall' || this.clientId === undefined) return
    if (frame.event === 'user-questions/request') {
      if (!Array.isArray(frame.request.questions)) return
      this.pending.set(frame.eventId, {
        eventId: frame.eventId,
        clientId: this.clientId,
        kind: 'question',
        sessionId: parseCompanionSessionId(frame.agentId),
        questions: structuredClone(frame.request.questions),
      })
      return
    }
    if (frame.event === 'approval/request') {
      if (typeof frame.request.toolName !== 'string') return
      this.pending.set(frame.eventId, {
        eventId: frame.eventId,
        clientId: this.clientId,
        kind: 'approval',
        sessionId: parseCompanionSessionId(frame.agentId),
        approvalId: typeof frame.request.approvalId === 'string' ? frame.request.approvalId : frame.eventId,
        toolName: frame.request.toolName,
        ...(typeof frame.request.callId === 'string' ? { callId: frame.request.callId } : {}),
        ...(typeof frame.request.reason === 'string' ? { reason: frame.request.reason } : {}),
      })
    }
  }

  /** @param interactionId - pairing-private id. @param key - exact pairing application key. */
  resolve(interactionId: CompanionInteractionId, key: Uint8Array): DesktopPendingCompanionInteraction | undefined {
    const expected = Buffer.from(interactionId, 'base64url')
    for (const pending of this.pending.values()) {
      const candidate = Buffer.from(deriveInteractionId(pending, key), 'base64url')
      if (candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected)) return { ...pending }
    }
    return undefined
  }

  /** Project current waits for one Session without exposing Host event ids. */
  project(sessionId: CompanionSessionId, key: Uint8Array): ReadonlyArray<{
    kind: 'approval' | 'question'
    interactionId: CompanionInteractionId
    sessionId: CompanionSessionId
    payload: Record<string, unknown>
  }> {
    return [...this.pending.values()].filter(pending => pending.sessionId === sessionId).map(pending => ({
      kind: pending.kind,
      interactionId: deriveInteractionId(pending, key),
      sessionId: pending.sessionId,
      payload: pending.kind === 'approval'
        ? {
          approvalId: pending.approvalId, toolName: pending.toolName,
          ...(pending.callId === undefined ? {} : { callId: pending.callId }),
          ...(pending.reason === undefined ? {} : { reason: pending.reason }),
        }
        : { questions: structuredClone(pending.questions) },
    }))
  }

  /** Drop one settled waterfall before the Host cancel frame arrives. */
  forget(eventId: RemoteEventId): void {
    this.pending.delete(eventId)
  }

  /** Drop every Host-generation request before a replacement stream begins. */
  clear(): void {
    this.clientId = undefined
    this.pending.clear()
  }
}

function deriveInteractionId(pending: PendingInteraction, key: Uint8Array): CompanionInteractionId {
  const digest = createHmac('sha256', key)
    .update('dsh-companion-interaction-v1\0')
    .update(pending.kind).update('\0')
    .update(pending.sessionId).update('\0')
    .update(pending.eventId)
    .digest()
  return parseCompanionInteractionId(encodeProtocolBase64Url(digest))
}
