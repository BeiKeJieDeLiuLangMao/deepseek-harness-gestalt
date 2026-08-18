/** Opaque multi-instance Relay lifecycle owned by Remote Access. */

import { createHash, randomBytes as secureRandomBytes } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import {
  parseRelayCredential,
  type RelayAttachMessage,
  type RelayAttachmentId,
  type RelayCiphertextMessage,
  type RelayCredential,
  type RelayErrorCode,
  type RelayHeartbeatMessage,
  type RelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/u

/** Opaque identity of one stateless Platform process. */
export type RelayInstanceId = Branded<'RelayInstanceId'>
/** Opaque generation preventing stale directory cleanup from deleting a replacement attachment. */
export type RelayConnectionToken = Branded<'RelayConnectionToken'>

/** Validated deployment tunables for one Relay provider. */
export interface RemoteRelayConfig {
  /** Retry delay returned only when a new attachment is shed at capacity. */
  capacityRetryAfterMs: number
  /** Lifetime of one expiring shared-directory entry. */
  directoryTtlMs: number
  /** Maximum interval without an authenticated heartbeat before disconnect. */
  heartbeatTimeoutMs: number
  /** Maximum ciphertext bytes waiting for one live socket writer. */
  maxBufferedCiphertextBytes: number
  /** Maximum live attachments accepted by this Platform Instance. */
  maxConnections: number
}

/** Persistent, content-free route authorization required by every Platform Instance. */
export interface RelayRouteStore {
  /** @returns the new monotonically increasing route revision. */
  rotate(routeId: RelayRouteId, credentialDigest: Uint8Array): Promise<number>
  /** @returns the current authorized revision, or undefined for wrong/revoked authority. */
  authorize(routeId: RelayRouteId, credentialDigest: Uint8Array): Promise<number | undefined>
  /** @returns the new monotonically increasing revoked revision. */
  revoke(routeId: RelayRouteId): Promise<number>
}

/** One expiring attachment location stored outside every stateless Platform Instance. */
export interface RelayDirectoryEntry {
  routeId: RelayRouteId
  attachmentId: RelayAttachmentId
  endpoint: 'mobile' | 'desktop'
  instanceId: RelayInstanceId
  connectionToken: RelayConnectionToken
  revision: number
  expiresAt: number
}

/** Ciphertext-only forwarding or content-free invalidation carried between Platform Instances. */
export type RelayCoordinationEvent =
  | (RelayCiphertextMessage & { targetConnectionToken: RelayConnectionToken; revision: number })
  | { type: 'invalidate'; routeId: RelayRouteId; revision: number }

/** Shared ephemeral directory, invalidation, and ciphertext Pub/Sub adapter. */
export interface RelayCoordinator {
  /** Subscribe one Platform Instance to direct ephemeral events. */
  listen(
    instanceId: RelayInstanceId,
    listener: (event: RelayCoordinationEvent) => Promise<void>,
  ): Promise<() => Promise<void>>
  /** Publish or replace one expiring live-attachment directory entry. */
  register(entry: RelayDirectoryEntry): Promise<void>
  /** Extend one still-current directory entry. */
  refresh(entry: RelayDirectoryEntry): Promise<boolean>
  /** Remove one entry only when its connection token is still current. */
  unregister(entry: RelayDirectoryEntry): Promise<void>
  /** Resolve one live target without creating durable delivery state. */
  locate(routeId: RelayRouteId, attachmentId: RelayAttachmentId): Promise<RelayDirectoryEntry | undefined>
  /** Publish one ciphertext event to a currently subscribed Platform Instance. */
  publish(instanceId: RelayInstanceId, event: RelayCoordinationEvent): Promise<boolean>
  /** Fan out one content-free route invalidation. */
  invalidate(event: Extract<RelayCoordinationEvent, { type: 'invalidate' }>): Promise<void>
}

/** One newly rotated Desktop Relay credential; only its digest enters persistence. */
export interface RelayCredentialGrant {
  routeId: RelayRouteId
  credential: RelayCredential
  revision: number
}

/** Stable, content-free Relay lifecycle failure. */
export class RemoteRelayError extends Error {
  /** @param code - Relay Transport failure category. @param retryAfterMs - optional capacity retry delay. */
  constructor(readonly code: RelayErrorCode, message: string, readonly retryAfterMs?: number) {
    super(message)
    this.name = 'RemoteRelayError'
  }
}

/** Live endpoint attachment admitted by {@link RemoteRelayService}. */
export interface RemoteRelayAttachment {
  /** Accept one decoded Relay Transport frame from this endpoint. */
  receive(message: RelayCiphertextMessage | RelayHeartbeatMessage): Promise<void>
  /** Remove this live attachment from the shared directory and drain its writer. */
  close(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteRelay: RemoteRelayService
  }
}

/** Public Remote Access Relay capability used by the WSS Consumer. */
export abstract class RemoteRelayService extends Service {
  /** @param ctx - Platform composition context receiving the Relay capability. */
  constructor(ctx: Context) { super(ctx, 'remoteRelay') }

  /**
   * Rotate one route to fresh authority and invalidate older attachments.
   * @param routeId - opaque route receiving new attachment authority.
   * @returns the one-time credential grant and its persistent revision.
   */
  abstract rotateCredential(routeId: RelayRouteId): Promise<RelayCredentialGrant>
  /**
   * Revoke one route and close its attachments across Platform Instances.
   * @param routeId - opaque route whose current authority becomes invalid.
   */
  abstract revokeRoute(routeId: RelayRouteId): Promise<void>
  /**
   * Authenticate and register one outbound Mobile or Desktop attachment.
   * @param input - attach frame plus the socket writer and optional close callback.
   * @returns the admitted attachment receiving later frames from that socket.
   */
  abstract attach(input: {
    message: RelayAttachMessage
    deliver: (message: RelayCiphertextMessage) => Promise<void>
    close?: () => void | Promise<void>
  }): Promise<RemoteRelayAttachment>
}

interface LocalAttachment {
  entry: RelayDirectoryEntry
  deliver: (message: RelayCiphertextMessage) => Promise<void>
  credentialDigest: Uint8Array
  close?: () => void | Promise<void>
  writer: Promise<void>
  bufferedBytes: number
  heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  closed: boolean
}

/** Stateless Relay provider over persistent route authority and ephemeral shared coordination. */
export class RemoteRelayProvider extends RemoteRelayService {
  private readonly attachments = new Map<string, LocalAttachment>()
  private readonly ready: Promise<() => Promise<void>>
  private readonly config: RemoteRelayConfig
  private readonly randomBytes: (size: number) => Uint8Array
  private readonly schedule: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  private disposed = false

  /** @param ctx - Platform context. @param options - instance, storage, coordination, bounds, and entropy. */
  constructor(ctx: Context, private readonly options: {
    instanceId: RelayInstanceId
    routeStore: RelayRouteStore
    coordinator: RelayCoordinator
    config: RemoteRelayConfig
    randomBytes?: (size: number) => Uint8Array
    clock?: { now(): number }
    schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  }) {
    super(ctx)
    this.config = validateRemoteRelayConfig(options.config)
    this.randomBytes = options.randomBytes ?? secureRandomBytes
    this.schedule = options.schedule ?? ((task, delayMs) => setTimeout(task, delayMs))
    this.ready = options.coordinator.listen(options.instanceId, event => this.receiveCoordinationEvent(event))
    ctx.effect(() => async () => { await this.dispose() }, 'remote-access: Relay resources')
  }

  async rotateCredential(routeId: RelayRouteId): Promise<RelayCredentialGrant> {
    this.assertOpen()
    const bytes = this.randomBytes(32)
    if (bytes.byteLength !== 32) throw new TypeError('Relay credential source must return 32 bytes')
    const credential = parseRelayCredential(Buffer.from(bytes).toString('base64url'))
    bytes.fill(0)
    const revision = await this.options.routeStore.rotate(routeId, credentialDigest(credential))
    if (revision > 1) await this.options.coordinator.invalidate({ type: 'invalidate', routeId, revision })
    return { routeId, credential, revision }
  }

  async revokeRoute(routeId: RelayRouteId): Promise<void> {
    this.assertOpen()
    const revision = await this.options.routeStore.revoke(routeId)
    await this.options.coordinator.invalidate({ type: 'invalidate', routeId, revision })
  }

  async attach(input: {
    message: RelayAttachMessage
    deliver: (message: RelayCiphertextMessage) => Promise<void>
    close?: () => void | Promise<void>
  }): Promise<RemoteRelayAttachment> {
    this.assertOpen()
    await this.ready
    if (this.attachments.size >= this.config.maxConnections) {
      throw new RemoteRelayError('PLATFORM_CAPACITY', 'Platform Instance has reached its Relay attachment limit', this.config.capacityRetryAfterMs)
    }
    const digest = credentialDigest(input.message.credential)
    let revision: number | undefined
    try {
      revision = await this.options.routeStore.authorize(
        input.message.routeId,
        digest,
      )
    } catch {
      throw new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay route authority is unavailable')
    }
    if (revision === undefined) {
      throw new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay credential is invalid')
    }
    const token = this.connectionToken()
    const entry: RelayDirectoryEntry = {
      routeId: input.message.routeId,
      attachmentId: input.message.attachmentId,
      endpoint: input.message.endpoint,
      instanceId: this.options.instanceId,
      connectionToken: token,
      revision,
      expiresAt: this.now() + this.config.directoryTtlMs,
    }
    const key = attachmentKey(entry.routeId, entry.attachmentId)
    const existing = this.attachments.get(key)
    if (existing !== undefined) await this.closeLocal(existing)
    const local: LocalAttachment = {
      entry,
      deliver: input.deliver,
      credentialDigest: digest,
      ...(input.close === undefined ? {} : { close: input.close }),
      writer: Promise.resolve(),
      bufferedBytes: 0,
      heartbeatTimer: undefined,
      closed: false,
    }
    this.attachments.set(key, local)
    try {
      await this.options.coordinator.register(entry)
      this.armHeartbeat(local)
    } catch (error) {
      this.attachments.delete(key)
      throw error
    }
    return {
      receive: async (message) => {
        if (message.type === 'heartbeat') await this.heartbeat(local, message)
        else await this.forward(local, message)
      },
      close: async () => { await this.closeAndDrain(local) },
    }
  }

  /** Close every local attachment and coordination subscription, observing every failure. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const stop = await this.ready
    const attachments = [...this.attachments.values()]
    const results = await Promise.allSettled([
      ...attachments.map(attachment => this.closeAndDrain(attachment)),
      stop(),
    ])
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
    if (errors.length > 0) throw new AggregateError(errors, 'Remote Relay disposal failed')
  }

  private async forward(local: LocalAttachment, message: RelayCiphertextMessage): Promise<void> {
    if (local.closed) throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay attachment is closed')
    if (message.routeId !== local.entry.routeId || message.sourceAttachmentId !== local.entry.attachmentId) {
      throw new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay ciphertext source does not match its attachment')
    }
    const target = await this.options.coordinator.locate(message.routeId, message.targetAttachmentId)
    if (target === undefined || target.expiresAt <= this.now()) {
      throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay target is offline')
    }
    const delivered = await this.options.coordinator.publish(target.instanceId, {
      ...message,
      targetConnectionToken: target.connectionToken,
      revision: target.revision,
    })
    if (!delivered) throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay target is offline')
  }

  private async heartbeat(local: LocalAttachment, message: RelayHeartbeatMessage): Promise<void> {
    if (local.closed) throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay attachment is closed')
    if (message.attachmentId !== local.entry.attachmentId) {
      throw new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay heartbeat does not match its attachment')
    }
    let revision: number | undefined
    try {
      revision = await this.options.routeStore.authorize(local.entry.routeId, local.credentialDigest)
    } catch {
      await this.closeLocal(local)
      throw new RemoteRelayError('RELAY_ROUTE_REVOKED', 'Relay route authority could not be revalidated')
    }
    if (revision === undefined || revision !== local.entry.revision) {
      await this.closeLocal(local)
      throw new RemoteRelayError('RELAY_ROUTE_REVOKED', 'Relay route authority changed')
    }
    const refreshed = { ...local.entry, expiresAt: this.now() + this.config.directoryTtlMs }
    if (!await this.options.coordinator.refresh(refreshed)) {
      await this.closeLocal(local)
      throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay directory entry is no longer current')
    }
    local.entry = refreshed
    this.armHeartbeat(local)
  }

  private async receiveCoordinationEvent(event: RelayCoordinationEvent): Promise<void> {
    if (event.type === 'invalidate') {
      const matches = [...this.attachments.values()].filter(
        attachment => attachment.entry.routeId === event.routeId && attachment.entry.revision < event.revision,
      )
      const results = await Promise.allSettled(matches.map(attachment => this.closeAndDrain(attachment)))
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
      if (errors.length > 0) throw new AggregateError(errors, 'Relay invalidation cleanup failed')
      return
    }
    const target = this.attachments.get(attachmentKey(event.routeId, event.targetAttachmentId))
    if (target === undefined || target.closed
      || target.entry.connectionToken !== event.targetConnectionToken
      || target.entry.revision !== event.revision) return
    const { targetConnectionToken: _targetConnectionToken, revision: _revision, ...message } = event
    await this.deliver(target, message)
  }

  private async deliver(local: LocalAttachment, message: RelayCiphertextMessage): Promise<void> {
    const size = message.ciphertext.byteLength
    if (local.bufferedBytes + size > this.config.maxBufferedCiphertextBytes) {
      await this.closeLocal(local)
      throw new RemoteRelayError('RELAY_SLOW_CONSUMER', 'Relay target exceeded its ciphertext buffer limit')
    }
    local.bufferedBytes += size
    const write = local.writer.then(async () => {
      if (local.closed) return
      await local.deliver(message)
    }).finally(() => { local.bufferedBytes -= size })
    local.writer = write.catch(() => {})
    try {
      await write
    } catch {
      await this.closeLocal(local)
      throw new RemoteRelayError('REMOTE_OFFLINE', 'Relay target writer failed')
    }
  }

  private async closeLocal(local: LocalAttachment): Promise<void> {
    if (local.closed) return
    local.closed = true
    clearTimeout(local.heartbeatTimer)
    local.heartbeatTimer = undefined
    const key = attachmentKey(local.entry.routeId, local.entry.attachmentId)
    this.attachments.delete(key)
    const operations: Promise<unknown>[] = [this.options.coordinator.unregister(local.entry)]
    if (local.close !== undefined) operations.push(Promise.resolve().then(local.close))
    const results = await Promise.allSettled(operations)
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
    if (errors.length > 0) throw new AggregateError(errors, 'Relay attachment close failed')
  }

  private async closeAndDrain(local: LocalAttachment): Promise<void> {
    const results = await Promise.allSettled([this.closeLocal(local), local.writer])
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
    if (errors.length > 0) throw new AggregateError(errors, 'Relay attachment drain failed')
  }

  private connectionToken(): RelayConnectionToken {
    const bytes = this.randomBytes(16)
    if (bytes.byteLength !== 16) throw new TypeError('Relay connection-token source must return 16 bytes')
    const value = Buffer.from(bytes).toString('base64url') as RelayConnectionToken
    bytes.fill(0)
    return value
  }

  private armHeartbeat(local: LocalAttachment): void {
    if (local.heartbeatTimer !== undefined) clearTimeout(local.heartbeatTimer)
    local.heartbeatTimer = this.schedule(() => {
      void this.closeLocal(local).catch((error: unknown) => {
        console.error('[remote-access] Relay heartbeat timeout cleanup failed:', error)
      })
    }, this.config.heartbeatTimeoutMs)
    local.heartbeatTimer.unref()
  }

  private now(): number { return this.options.clock?.now() ?? Date.now() }

  private assertOpen(): void {
    if (this.disposed) throw new RemoteRelayError('REMOTE_OFFLINE', 'Platform Instance is offline')
  }
}

/**
 * Parse an opaque Platform Instance id at a coordination boundary.
 * @param value - untrusted coordination value.
 * @returns branded Platform Instance id.
 */
export function parseRelayInstanceId(value: unknown): RelayInstanceId {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError('Relay instance id must be 1-128 base64url characters')
  }
  return value as RelayInstanceId
}

/**
 * Parse a stale-cleanup-safe live connection token at a coordination boundary.
 * @param value - untrusted coordination value.
 * @returns branded live connection token.
 */
export function parseRelayConnectionToken(value: unknown): RelayConnectionToken {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError('Relay connection token must be 1-128 base64url characters')
  }
  return value as RelayConnectionToken
}

function credentialDigest(credential: RelayCredential): Uint8Array {
  return new Uint8Array(createHash('sha256').update(credential).digest())
}

function attachmentKey(routeId: RelayRouteId, attachmentId: RelayAttachmentId): string {
  return `${routeId}:${attachmentId}`
}

function validateRemoteRelayConfig(config: RemoteRelayConfig): RemoteRelayConfig {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`Remote Relay ${name} must be a positive integer`)
  }
  return { ...config }
}
