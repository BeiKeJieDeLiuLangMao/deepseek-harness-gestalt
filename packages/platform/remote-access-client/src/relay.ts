/** Mobile/Desktop Relay connection lifecycle with reconnect and no offline mutation queue. */

import { RemoteRelayError } from '@deepseek-ai/dsh-remote-access'
import {
  decodeRelayMessage,
  encodeRelayMessage,
  type RelayAttachmentId,
  type RelayCredential,
  type RelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'

/** One connected WSS carrier supplied by a native or browser adapter. */
export interface RelayEndpointSocket {
  /** Write one complete encoded Relay Transport message. */
  send(value: Uint8Array): Promise<void>
  /** Read complete encoded Relay Transport messages until socket loss. */
  messages(): AsyncIterable<Uint8Array>
  /** Close the physical socket and resolve after its read side ends. */
  close(): Promise<void>
}

/** Desktop lifecycle reasons that always make the paired route Remote Offline. */
export type DesktopRelayStopReason = 'window-close' | 'sleep' | 'quit' | 'mobile-access-disabled'

/** Construction inputs for one Mobile or Desktop outbound Relay endpoint. */
export interface RemoteRelayEndpointOptions {
  endpoint: 'mobile' | 'desktop'
  /** Current protected route authority; production storage remains endpoint-owned. */
  route(): Promise<{ routeId: RelayRouteId; credential: RelayCredential }>
  /** Fresh live attachment id for every physical connection. */
  attachmentId(): RelayAttachmentId
  /** Open one outbound connection through the deployment's single Platform endpoint. */
  connect(): Promise<RelayEndpointSocket>
  /** Validated heartbeat interval shorter than the Platform heartbeat timeout. */
  heartbeatIntervalMs: number
  /** Validated delay before a fresh non-sticky connection acquisition. */
  reconnectDelayMs: number
  /** Desktop-only authoritative projection emitted after every successful attachment. */
  resynchronize?: (
    send: (targetAttachmentId: RelayAttachmentId, ciphertext: Uint8Array) => Promise<void>,
  ) => Promise<void>
  /** Endpoint-owned ciphertext receiver. */
  onCiphertext?: (ciphertext: Uint8Array, sourceAttachmentId: RelayAttachmentId) => void | Promise<void>
  /** Content-free transport error observer. */
  onTransportError?: (error: RemoteRelayError) => void
  clock?: { now(): number }
}

interface ActiveConnection {
  socket: RelayEndpointSocket
  routeId: RelayRouteId
  attachmentId: RelayAttachmentId
}

/** Reconnecting outbound endpoint; reconnect starts a new socket and never replays a mutation. */
export class RemoteRelayEndpointController {
  private active = false
  private connection: ActiveConnection | undefined
  private lifecycle: AbortController | undefined
  private run: Promise<void> | undefined

  /** @param options - route authority, socket adapter, lifecycle tunables, and endpoint callbacks. */
  constructor(private readonly options: RemoteRelayEndpointOptions) {
    for (const [name, value] of [
      ['heartbeatIntervalMs', options.heartbeatIntervalMs],
      ['reconnectDelayMs', options.reconnectDelayMs],
    ] as const) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`Remote Relay ${name} must be a positive integer`)
      }
    }
    if (options.endpoint === 'desktop' && options.resynchronize === undefined) {
      throw new TypeError('Desktop Relay endpoint requires an authoritative resynchronize callback')
    }
  }

  /** Start the lifecycle and resolve after the first attached endpoint resynchronizes. */
  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    const lifecycle = new AbortController()
    this.lifecycle = lifecycle
    const ready = deferred<void>()
    this.run = this.runConnections(lifecycle.signal, ready)
    await ready.promise
  }

  /**
   * Stop and drain the live socket; the optional reason remains local.
   * @param _reason - local Desktop lifecycle event that made the endpoint offline.
   */
  async stop(_reason?: DesktopRelayStopReason): Promise<void> {
    const running = this.run
    if (running === undefined) return
    this.active = false
    this.lifecycle?.abort()
    const connection = this.connection
    this.connection = undefined
    if (connection !== undefined) await connection.socket.close()
    this.run = undefined
    await running
    this.lifecycle = undefined
  }

  /**
   * Send only on the current live socket; offline operations are never retained or replayed.
   * @param targetAttachmentId - current peer attachment receiving the ciphertext.
   * @param ciphertext - bounded encrypted Companion Protocol frame.
   */
  async sendCiphertext(targetAttachmentId: RelayAttachmentId, ciphertext: Uint8Array): Promise<void> {
    const connection = this.connection
    if (!this.active || connection === undefined) {
      throw new RemoteRelayError('REMOTE_OFFLINE', 'Paired Desktop is Remote Offline')
    }
    await connection.socket.send(encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1,
      routeId: connection.routeId,
      sourceAttachmentId: connection.attachmentId,
      targetAttachmentId,
      ciphertext,
    }))
  }

  private async runConnections(signal: AbortSignal, ready: ReturnType<typeof deferred<void>>): Promise<void> {
    let first = true
    while (!isAborted(signal)) {
      try {
        const route = await this.options.route()
        const socket = await this.options.connect()
        if (isAborted(signal)) { await socket.close(); break }
        const attachmentId = this.options.attachmentId()
        await socket.send(encodeRelayMessage({
          type: 'attach', transportVersion: 1,
          routeId: route.routeId,
          attachmentId,
          endpoint: this.options.endpoint,
          credential: route.credential,
        }))
        const connection = { socket, routeId: route.routeId, attachmentId }
        this.connection = connection
        if (this.options.endpoint === 'desktop') {
          await this.options.resynchronize?.((target, ciphertext) => this.sendCiphertext(target, ciphertext))
        }
        if (first) { first = false; ready.resolve() }
        const heartbeatAbort = new AbortController()
        const heartbeat = this.heartbeat(connection, heartbeatAbort.signal)
        try {
          for await (const encoded of socket.messages()) {
            if (isAborted(signal)) break
            await this.receive(encoded)
          }
        } finally {
          heartbeatAbort.abort()
          if (this.connection === connection) this.connection = undefined
          await socket.close()
          await heartbeat
        }
      } catch (error) {
        if (!isAborted(signal)) this.observeError(error)
      }
      if (!isAborted(signal)) await delay(this.options.reconnectDelayMs, signal)
    }
    if (first) ready.reject(new RemoteRelayError('REMOTE_OFFLINE', 'Relay lifecycle stopped before attachment'))
  }

  private async heartbeat(connection: ActiveConnection, signal: AbortSignal): Promise<void> {
    while (!isAborted(signal) && this.connection === connection) {
      await delay(this.options.heartbeatIntervalMs, signal)
      if (isAborted(signal) || this.connection !== connection) return
      await connection.socket.send(encodeRelayMessage({
        type: 'heartbeat', transportVersion: 1,
        attachmentId: connection.attachmentId,
        sentAt: this.options.clock?.now() ?? Date.now(),
      }))
    }
  }

  private async receive(encoded: Uint8Array): Promise<void> {
    const message = decodeRelayMessage(encoded)
    if (message.type === 'ciphertext') {
      await this.options.onCiphertext?.(message.ciphertext, message.sourceAttachmentId)
      return
    }
    if (message.type === 'error') {
      const error = new RemoteRelayError(message.code, `Remote Relay returned ${message.code}`, message.retryAfterMs)
      this.options.onTransportError?.(error)
      if (message.code === 'REMOTE_OFFLINE' || message.code === 'PLATFORM_CAPACITY') return
      throw error
    }
    throw new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay endpoint received an invalid server message')
  }

  private observeError(error: unknown): void {
    this.options.onTransportError?.(error instanceof RemoteRelayError
      ? error
      : new RemoteRelayError('REMOTE_OFFLINE', 'Relay connection was lost'))
  }
}

function isAborted(signal: AbortSignal): boolean { return signal.aborted }

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds)
    signal.addEventListener('abort', done, { once: true })
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}
