import { createServer, type Server } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import {
  RemoteRelayProvider,
  parseRelayInstanceId,
  type RelayCoordinator,
  type RelayDirectoryEntry,
  type RelayRouteStore,
  type RemoteRelayConfig,
} from '@deepseek-ai/dsh-remote-access'
import {
  RemoteRelayEndpointController,
  type RelayEndpointSocket,
} from '@deepseek-ai/dsh-remote-access-client'
import { RedisRelayCoordinator, type RelayRedisClient } from '@deepseek-ai/dsh-remote-access-redis'
import { RelayWebSocketConsumer } from '@deepseek-ai/dsh-remote-access-http'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  decodeCompanionMessage,
  encodeCompanionMessage,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseCompanionTranscriptEntryId,
  parseRelayAttachmentId,
  parseRelayRouteId,
  type RelayAttachmentId,
  type RelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import z from '@deepseek-ai/schemastery'
import WebSocket, { type RawData } from 'ws'
import { KeylessHarnessCipher } from '../remote-protocol/start.ts'

/** Explicit deployment-like tunables for the keyless two-instance composition. */
export interface Config extends RemoteRelayConfig {
  attachTimeoutMs: number
  heartbeatIntervalMs: number
  reconnectDelayMs: number
}

/** Validated scenario configuration; production supplies the same choices from deployment config. */
export const Config: z<Config> = z.object({
  attachTimeoutMs: z.natural().min(1).required(),
  capacityRetryAfterMs: z.natural().min(1).required(),
  directoryTtlMs: z.natural().min(1).required(),
  heartbeatIntervalMs: z.natural().min(1).required(),
  heartbeatTimeoutMs: z.natural().min(1).required(),
  maxBufferedCiphertextBytes: z.natural().min(1).required(),
  maxConnections: z.natural().min(1).required(),
  reconnectDelayMs: z.natural().min(1).required(),
})

/** Cordis name for the keyless two-instance Relay acceptance composition. */
export const name = 'two-instance-relay-keyless-scenario'

/** Run one encrypted round trip, instance replacement, and explicit offline miss. */
export async function apply(_ctx: Context, config: Config): Promise<void> {
  const bus = new KeylessRedisBus()
  const routeStore = new KeylessRouteStore()
  const backendA = await startBackend('platform-a', routeStore, bus, config, 11)
  const backendB = await startBackend('platform-b', routeStore, bus, config, 29)
  const backends = [backendA, backendB]
  const acquired: string[] = []
  let acquisition = 0
  const connectEndpoint = async (): Promise<RelayEndpointSocket> => {
    const backend = backends[acquisition++ % backends.length] as Backend
    acquired.push(backend.id)
    return WsRelaySocket.connect(backend.url)
  }
  const routeId = parseRelayRouteId('route-keyless')
  const grant = await backendA.provider.rotateCredential(routeId)
  const cipher = new KeylessHarnessCipher()
  const mobileProtocol = negotiateCompanionProtocol(
    createCompanionNegotiationChannel(),
    createCompanionVersionOffer('mobile'),
    createCompanionVersionOffer('desktop'),
  )
  const desktopProtocol = negotiateCompanionProtocol(
    createCompanionNegotiationChannel(),
    createCompanionVersionOffer('mobile'),
    createCompanionVersionOffer('desktop'),
  )
  const mobileAttachmentId = parseRelayAttachmentId('mobile-keyless')
  let desktopAttachmentId = parseRelayAttachmentId('desktop-keyless-1')
  let desktopGeneration = 0
  let resyncCount = 0
  const result = deferred<'accepted'>()
  const offline = deferred<string>()
  const desktop = new RemoteRelayEndpointController({
    endpoint: 'desktop',
    route: async () => grant,
    attachmentId: () => {
      desktopGeneration += 1
      desktopAttachmentId = parseRelayAttachmentId(`desktop-keyless-${String(desktopGeneration)}`)
      return desktopAttachmentId
    },
    connect: connectEndpoint,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    reconnectDelayMs: config.reconnectDelayMs,
    resynchronize: async (send) => {
      resyncCount += 1
      await send(mobileAttachmentId, cipher.seal(encodeCompanionMessage(desktopProtocol, {
        type: 'projection',
        projection: {
          type: 'transcript-page',
          sessionId: parseCompanionSessionId('session-keyless'),
          entries: [{
            type: 'text', entryId: parseCompanionTranscriptEntryId(`resync-${String(resyncCount)}`),
            role: 'assistant', text: `desktop authoritative revision ${String(resyncCount)}`,
          }],
        },
      })))
    },
    onCiphertext: async (ciphertext, sourceAttachmentId) => {
      const message = decodeCompanionMessage(desktopProtocol, cipher.open(ciphertext))
      if (message.type !== 'operation') return
      await desktop.sendCiphertext(sourceAttachmentId, cipher.seal(encodeCompanionMessage(desktopProtocol, {
        type: 'result',
        result: {
          type: 'confirmed', operationId: message.operation.operationId,
          committedAt: 1_787_027_200_000, outcome: 'accepted',
        },
      })))
    },
  })
  const mobile = new RemoteRelayEndpointController({
    endpoint: 'mobile',
    route: async () => grant,
    attachmentId: () => mobileAttachmentId,
    connect: connectEndpoint,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    reconnectDelayMs: config.reconnectDelayMs,
    onCiphertext: async (ciphertext) => {
      const message = decodeCompanionMessage(mobileProtocol, cipher.open(ciphertext))
      if (message.type === 'result') result.resolve(message.result.outcome)
    },
    onTransportError: (error) => { if (error.code === 'REMOTE_OFFLINE') offline.resolve(error.code) },
  })
  try {
    await mobile.start()
    await waitForDirectory(backendA.coordinator, routeId, mobileAttachmentId)
    await desktop.start()
    await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    console.log(`PLATFORM endpoint=one nonSticky=true mobile=${acquired[0]} desktop=${acquired[1]}`)
    const prompt = 'continue from Mobile across instances'
    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(encodeCompanionMessage(mobileProtocol, {
      type: 'operation',
      operation: {
        type: 'submit-prompt', operationId: parseCompanionOperationId('operation-keyless'),
        sessionId: parseCompanionSessionId('session-keyless'), text: prompt,
      },
    })))
    console.log(`ROUND_TRIP encrypted=true relayBusinessValue=${String(bus.published.some(value => value.includes(prompt)))} outcome=${await result.promise}`)

    await backendB.close()
    await waitUntil(() => resyncCount === 2)
    const replacement = await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    console.log(`FAILOVER liveSocketMigration=false desktopReconnect=${replacement.instanceId} resync=${String(resyncCount)}`)

    await desktop.stop('window-close')
    await waitUntil(async () => await backendA.coordinator.locate(routeId, desktopAttachmentId) === undefined)
    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(Uint8Array.of(1)))
    console.log(`OFFLINE code=${await offline.promise} queued=${String(bus.queuedMessages)}`)
    console.log('LIFECYCLE windowClose=offline sleep=offline quit=offline disable=offline backgroundHost=false remoteWake=false')
    console.log('CRYPTO product=fail-closed keylessScenario=true')
  } finally {
    await Promise.allSettled([mobile.stop(), desktop.stop(), backendA.close(), backendB.close()])
  }
}

interface Backend {
  id: string
  url: string
  provider: RemoteRelayProvider
  coordinator: RedisRelayCoordinator
  close(): Promise<void>
}

async function startBackend(
  id: string,
  routeStore: RelayRouteStore,
  bus: KeylessRedisBus,
  config: Config,
  randomByte: number,
): Promise<Backend> {
  const ctx = new Context()
  const coordinator = new RedisRelayCoordinator({
    command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:development:relay',
  })
  const provider = new RemoteRelayProvider(ctx, {
    instanceId: parseRelayInstanceId(id), routeStore, coordinator,
    config: {
      capacityRetryAfterMs: config.capacityRetryAfterMs,
      directoryTtlMs: config.directoryTtlMs,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs,
      maxBufferedCiphertextBytes: config.maxBufferedCiphertextBytes,
      maxConnections: config.maxConnections,
    },
    randomBytes: size => new Uint8Array(size).fill(randomByte),
  })
  const consumer = new RelayWebSocketConsumer(ctx, config.attachTimeoutMs)
  const server = createServer()
  server.on('upgrade', (req, socket, head) => { consumer.handleUpgrade(req, socket, head) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Relay backend did not bind a TCP port')
  let closed = false
  return {
    id,
    url: `ws://127.0.0.1:${String(address.port)}/v1/remote-access/relay`,
    provider,
    coordinator,
    close: async () => {
      if (closed) return
      closed = true
      const results = await Promise.allSettled([
        consumer.close(),
        provider.dispose(),
        closeServer(server),
      ])
      const errors = results.filter(value => value.status === 'rejected').map(value => value.reason as unknown)
      if (errors.length > 0) throw new AggregateError(errors, `Relay backend ${id} failed to close`)
    },
  }
}

class WsRelaySocket implements RelayEndpointSocket {
  private readonly queue = new AsyncQueue<Uint8Array>()
  private readonly done = deferred<void>()
  private readonly socket: WebSocket
  private closed = false

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.on('message', (data) => { this.queue.push(bytes(data)) })
    socket.once('close', () => { this.closed = true; this.queue.end(); this.done.resolve() })
    socket.once('error', (error) => { this.queue.end(); this.done.reject(error) })
  }

  static async connect(url: string): Promise<WsRelaySocket> {
    const socket = new WebSocket(url, { perMessageDeflate: false })
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })
    return new WsRelaySocket(socket)
  }

  async send(value: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.send(value, { binary: true }, (error) => {
        if (error == null) resolve(); else reject(error)
      })
    })
  }

  messages(): AsyncIterable<Uint8Array> { return this.queue }

  async close(): Promise<void> {
    if (!this.closed) this.socket.close()
    await this.done.promise.catch(() => {})
  }
}

class KeylessRouteStore implements RelayRouteStore {
  private readonly routes = new Map<string, { digest: string; revision: number; revoked: boolean }>()

  async rotate(routeId: RelayRouteId, digest: Uint8Array): Promise<number> {
    const revision = (this.routes.get(routeId)?.revision ?? 0) + 1
    this.routes.set(routeId, { digest: Buffer.from(digest).toString('hex'), revision, revoked: false })
    return revision
  }

  async authorize(routeId: RelayRouteId, digest: Uint8Array): Promise<number | undefined> {
    const route = this.routes.get(routeId)
    return route !== undefined && !route.revoked && route.digest === Buffer.from(digest).toString('hex')
      ? route.revision
      : undefined
  }

  async revoke(routeId: RelayRouteId): Promise<number> {
    const revision = (this.routes.get(routeId)?.revision ?? 0) + 1
    this.routes.set(routeId, { digest: '', revision, revoked: true })
    return revision
  }
}

class KeylessRedisBus {
  readonly published: string[] = []
  readonly queuedMessages = 0
  private readonly values = new Map<string, string>()
  private readonly subscriptions = new Map<string, Set<(message: string) => void>>()

  client(): RelayRedisClient {
    return {
      get: async key => this.values.get(key) ?? null,
      set: async (key, value) => { this.values.set(key, value); return 'OK' },
      eval: async (_script, options) => {
        const key = options.keys[0]
        if (key === undefined) return 0
        const value = this.values.get(key)
        if (value === undefined) return 0
        const record = JSON.parse(value) as { connectionToken?: string }
        if (record.connectionToken !== options.arguments[0]) return 0
        const replacement = options.arguments[1]
        if (replacement === undefined) this.values.delete(key)
        else this.values.set(key, replacement)
        return 1
      },
      publish: async (channel, message) => {
        this.published.push(message)
        const listeners = [...(this.subscriptions.get(channel) ?? [])]
        for (const listener of listeners) listener(message)
        return listeners.length
      },
      subscribe: async (channel, listener) => {
        const listeners = this.subscriptions.get(channel) ?? new Set()
        listeners.add(listener)
        this.subscriptions.set(channel, listeners)
      },
      unsubscribe: async (channel, listener) => { this.subscriptions.get(channel)?.delete(listener) },
    }
  }
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waits: Array<(value: IteratorResult<T>) => void> = []
  private ended = false

  push(value: T): void {
    const wait = this.waits.shift()
    if (wait === undefined) this.values.push(value)
    else wait({ done: false, value })
  }

  end(): void {
    this.ended = true
    for (const wait of this.waits.splice(0)) wait({ done: true, value: undefined })
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const value = this.values.shift()
      if (value !== undefined) { yield value; continue }
      if (this.ended) return
      const next = await new Promise<IteratorResult<T>>((resolve) => { this.waits.push(resolve) })
      if (next.done) return
      yield next.value
    }
  }
}

function bytes(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

async function waitForDirectory(
  coordinator: RelayCoordinator,
  routeId: RelayRouteId,
  attachmentId: RelayAttachmentId,
): Promise<RelayDirectoryEntry> {
  let found: RelayDirectoryEntry | undefined
  await waitUntil(async () => {
    found = await coordinator.locate(routeId, attachmentId)
    return found !== undefined
  })
  return found as RelayDirectoryEntry
}

async function waitUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Relay keyless scenario timed out')
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}
