/**
 * Pairing-scoped encrypted attachment blob store and one-time capabilities.
 * @module @deepseek-ai/dsh-remote-attachments
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { randomBytes } from 'node:crypto'
import type { PersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  parseAttachmentCapability,
  REMOTE_PROTOCOL_LIMITS,
  type AttachmentCapability,
} from '@deepseek-ai/dsh-remote-protocol'

/** Stable attachment blob store failure categories; none carry application data. */
export type RemoteAttachmentErrorCode =
  | 'ATTACHMENT_CAPABILITY_INVALID'
  | 'ATTACHMENT_EXPIRED'
  | 'ATTACHMENT_PAIRING_MISMATCH'
  | 'ATTACHMENT_LIMIT_EXCEEDED'
  | 'ATTACHMENT_CAPACITY'

/** Attachment blob store failure. */
export class RemoteAttachmentError extends Error {
  /** @param code - failure category. @param message - operator-facing diagnosis. */
  constructor(readonly code: RemoteAttachmentErrorCode, message: string) {
    super(message)
    this.name = 'RemoteAttachmentError'
  }
}

/** Capability, ciphertext, and pairing scope retained for one not-yet-consumed blob. */
export interface RemoteAttachmentBlob {
  capability: AttachmentCapability
  pairingId: PersonalPairingId
  ciphertext: Uint8Array
  expiresAt: number
}

/** Capability grant returned to Mobile after one ciphertext upload. */
export interface RemoteAttachmentGrant {
  capability: AttachmentCapability
  byteLength: number
  expiresAt: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteAttachments: RemoteAttachmentStoreService
  }
}

/**
 * Platform attachment blob store: retains ciphertext and metadata only, bounded per blob
 * and in total, scoped to exactly one Personal Pairing, single-use, and expiring.
 */
export abstract class RemoteAttachmentStoreService extends Service {
  /** @param ctx - Platform composition context receiving the store capability. */
  constructor(ctx: Context) { super(ctx, 'remoteAttachments') }

  /** Per-blob ciphertext ceiling this deployment enforces; never above the protocol ceiling. */
  abstract readonly maxBlobBytes: number

  /** Capability and blob lifetime this deployment enforces; never above the protocol default. */
  abstract readonly capabilityLifetimeMs: number

  /**
   * Retain one pairing-scoped ciphertext blob and issue its one-time capability.
   * @param input - owning Personal Pairing, endpoint-encrypted ciphertext, and current time.
   * @returns the capability grant Mobile forwards to Desktop.
   */
  abstract publish(input: { pairingId: PersonalPairingId; ciphertext: Uint8Array; now: number }): Promise<RemoteAttachmentGrant>

  /**
   * Exchange one capability for its ciphertext exactly once, then remove both.
   * @param input - requesting Personal Pairing, one-time capability, and current time.
   * @returns the retained ciphertext bytes.
   */
  abstract consume(input: {
    pairingId: PersonalPairingId
    capability: AttachmentCapability
    now: number
  }): Promise<Uint8Array>

  /**
   * Remove one blob and its capability regardless of remaining lifetime.
   * @param capability - capability whose blob is revoked.
   */
  abstract revoke(capability: AttachmentCapability): Promise<void>

  /**
   * Project every retained blob for Platform-side operations.
   * @returns ciphertext and metadata only; no plaintext exists on this side of the boundary.
   */
  abstract observe(): readonly RemoteAttachmentBlob[]
}

interface StoredEntry {
  pairingId: PersonalPairingId
  ciphertext: Uint8Array
  expiresAt: number
}

/** In-process provider construction inputs. */
export interface RemoteAttachmentStoreOptions {
  /** Per-blob ciphertext ceiling; defaults to the accepted protocol ceiling. */
  maxBlobBytes?: number
  /** Capability lifetime; defaults to the accepted fifteen-minute default. */
  capabilityLifetimeMs?: number
  /** Maximum simultaneously retained blobs; capacity failures are explicit. */
  maxRetainedBlobs: number
  /** Interval removing expired blobs in the background. */
  sweepIntervalMs: number
  /** Schedule backend for the sweep timer; defaults to `setTimeout`. */
  schedule?: (handler: () => void, ms: number) => { unref(): void }
}

/**
 * In-process bounded store matching the single-process Platform deployment.
 * Expiry is enforced lazily at every access and by a background sweep.
 */
export class RemoteAttachmentStoreProvider extends RemoteAttachmentStoreService {
  readonly maxBlobBytes: number
  readonly capabilityLifetimeMs: number
  private readonly maxRetainedBlobs: number
  private readonly entries = new Map<string, StoredEntry>()

  /** @param ctx - Platform composition context. @param options - validated deployment bounds. */
  constructor(ctx: Context, options: RemoteAttachmentStoreOptions) {
    super(ctx)
    this.maxBlobBytes = options.maxBlobBytes ?? REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes
    this.capabilityLifetimeMs = options.capabilityLifetimeMs ?? REMOTE_PROTOCOL_LIMITS.attachmentCapabilityLifetimeMs
    this.maxRetainedBlobs = options.maxRetainedBlobs
    if (!Number.isSafeInteger(this.maxBlobBytes) || this.maxBlobBytes <= 0
      || this.maxBlobBytes > REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes) {
      throw new TypeError('Remote attachment maxBlobBytes must be a positive integer within the protocol ceiling')
    }
    if (!Number.isSafeInteger(this.capabilityLifetimeMs) || this.capabilityLifetimeMs <= 0
      || this.capabilityLifetimeMs > REMOTE_PROTOCOL_LIMITS.attachmentCapabilityLifetimeMs) {
      throw new TypeError('Remote attachment capabilityLifetimeMs must be a positive integer within the protocol default')
    }
    if (!Number.isSafeInteger(options.sweepIntervalMs) || options.sweepIntervalMs <= 0) {
      throw new TypeError('Remote attachment sweepIntervalMs must be a positive integer')
    }
    const schedule = options.schedule ?? ((handler: () => void, ms: number) => setTimeout(handler, ms))
    const timer = schedule(() => { this.sweep(Date.now()) }, options.sweepIntervalMs)
    timer.unref()
    ctx.effect(() => () => { this.dispose() }, 'remote-attachments: retained blobs')
  }

  // oxlint-disable-next-line typescript/require-await -- async keeps the failure a rejection, not a synchronous throw
  override async publish(input: {
    pairingId: PersonalPairingId
    ciphertext: Uint8Array
    now: number
  }): Promise<RemoteAttachmentGrant> {
    if (input.ciphertext.byteLength === 0) {
      throw new RemoteAttachmentError('ATTACHMENT_LIMIT_EXCEEDED', 'Remote attachment ciphertext must not be empty')
    }
    if (input.ciphertext.byteLength > this.maxBlobBytes) {
      throw new RemoteAttachmentError('ATTACHMENT_LIMIT_EXCEEDED', 'Remote attachment exceeds the per-blob byte ceiling')
    }
    this.sweep(input.now)
    if (this.entries.size >= this.maxRetainedBlobs) {
      throw new RemoteAttachmentError('ATTACHMENT_CAPACITY', 'Remote attachment store is at capacity')
    }
    const capability = randomBytes(32).toString('base64url') as AttachmentCapability
    const entry: StoredEntry = {
      pairingId: input.pairingId,
      ciphertext: input.ciphertext,
      expiresAt: input.now + this.capabilityLifetimeMs,
    }
    this.entries.set(capability, entry)
    return { capability, byteLength: input.ciphertext.byteLength, expiresAt: entry.expiresAt }
  }

  // oxlint-disable-next-line typescript/require-await -- async keeps the failure a rejection, not a synchronous throw
  override async consume(input: {
    pairingId: PersonalPairingId
    capability: AttachmentCapability
    now: number
  }): Promise<Uint8Array> {
    const entry = this.entries.get(input.capability)
    if (entry === undefined) {
      throw new RemoteAttachmentError('ATTACHMENT_CAPABILITY_INVALID', 'Remote attachment capability is unknown, consumed, or revoked')
    }
    if (input.now >= entry.expiresAt) {
      this.entries.delete(input.capability)
      throw new RemoteAttachmentError('ATTACHMENT_EXPIRED', 'Remote attachment capability has expired')
    }
    if (entry.pairingId !== input.pairingId) {
      throw new RemoteAttachmentError('ATTACHMENT_PAIRING_MISMATCH', 'Remote attachment capability belongs to another Personal Pairing')
    }
    this.entries.delete(input.capability)
    return entry.ciphertext
  }

  // oxlint-disable-next-line typescript/require-await -- async keeps the failure a rejection, not a synchronous throw
  override async revoke(capability: AttachmentCapability): Promise<void> {
    this.entries.delete(capability)
  }

  override observe(): readonly RemoteAttachmentBlob[] {
    return [...this.entries].map(([capability, entry]) => ({
      capability: parseAttachmentCapability(capability),
      pairingId: entry.pairingId,
      ciphertext: entry.ciphertext,
      expiresAt: entry.expiresAt,
    }))
  }

  /** Remove every retained blob and capability; ownership ends with this instance. */
  dispose(): void {
    this.sweep(Number.MAX_SAFE_INTEGER)
  }

  private sweep(now: number): void {
    for (const [capability, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(capability)
    }
  }
}
