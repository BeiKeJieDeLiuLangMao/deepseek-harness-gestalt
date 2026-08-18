import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:https'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import {
  parseRelayInstanceId,
  type RelayCoordinator,
  type RelayDirectoryEntry,
  type RelayRouteStore,
  type RemoteRelayConfig,
} from '@deepseek-ai/dsh-remote-access'
import { RemoteRelayProvider } from '@deepseek-ai/dsh-remote-access/relay-provider'
import {
  RemoteRelayEndpointController,
  type DesktopRelayStopReason,
} from '@deepseek-ai/dsh-remote-access-client'
import {
  DesktopRelayEndpointLifecycle,
  FailClosedDesktopRelayLifecycle,
} from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'
import { NodeRelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client/node-relay-socket'
import { RelayWebSocketConsumer } from '@deepseek-ai/dsh-remote-access-http/relay'
import { RedisRelayCoordinator, type RelayRedisClient } from '@deepseek-ai/dsh-remote-access-redis'
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
  REMOTE_PROTOCOL_LIMITS,
  type RelayAttachmentId,
  type RelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import z from '@deepseek-ai/schemastery'
import { KeylessHarnessCipher } from '../remote-protocol/start.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Explicit deployment-like tunables for the keyless two-instance composition. */
export interface Config extends RemoteRelayConfig {
  attachTimeoutMs: number
  heartbeatIntervalMs: number
  inboundMaxBytes: number
  inboundMaxMessages: number
  reconnectDelayMs: number
}

/** Validated scenario configuration; production supplies the same choices from deployment config. */
export const Config: z<Config> = z.object({
  attachTimeoutMs: z.natural().min(1).required(),
  capacityRetryAfterMs: z.natural().min(1).required(),
  deliveryAckTimeoutMs: z.natural().min(1).required(),
  directoryTtlMs: z.natural().min(1).required(),
  heartbeatIntervalMs: z.natural().min(1).required(),
  heartbeatTimeoutMs: z.natural().min(1).required(),
  inboundMaxBytes: z.natural().min(1).required(),
  inboundMaxMessages: z.natural().min(1).required(),
  maxBufferedCiphertextBytes: z.natural().min(1).required(),
  maxConnections: z.natural().min(1).required(),
  maxPendingDeliveries: z.natural().min(1).required(),
  reconnectDelayMs: z.natural().min(1).required(),
})

/** Cordis name for the keyless two-instance Relay acceptance composition. */
export const name = 'two-instance-relay-keyless-scenario'

/** Run one encrypted round trip, instance replacement, and Desktop lifecycle shutdowns. */
export async function apply(_ctx: Context, config: Config): Promise<void> {
  validateBundledConfig(config)
  await withResources(async (resources) => {
    const bus = new KeylessRedisBus()
    const routeStore = new KeylessRouteStore()
    const backendA = resources.add(await startBackend('platform-a', routeStore, bus, config, 11))
    const backendB = resources.add(await startBackend('platform-b', routeStore, bus, config, 29))
    const acquired: string[] = []
    const loadBalancer = resources.add(await startLoadBalancer([backendA, backendB], acquired))
    const connectEndpoint = async (signal: AbortSignal) => await NodeRelayEndpointSocket.connect(
      loadBalancer.url,
      signal,
      { maxBytes: config.inboundMaxBytes, maxMessages: config.inboundMaxMessages },
      { rejectUnauthorized: false },
    )
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
    let projectionRevision = 0
    let mobileProjection: { revision: number; text: string } | undefined
    const failoverProjection = deferred<void>()
    const result = deferred<'accepted'>()
    const offline = deferred<string>()
    const desktopLifecycle = new DesktopRelayEndpointLifecycle({
      attachmentId: () => {
        desktopGeneration += 1
        desktopAttachmentId = parseRelayAttachmentId(`desktop-keyless-${String(desktopGeneration)}`)
        return desktopAttachmentId
      },
      connect: connectEndpoint,
      attachTimeoutMs: config.attachTimeoutMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      reconnectDelayMs: config.reconnectDelayMs,
      resynchronize: async (send) => {
        projectionRevision += 1
        await send(mobileAttachmentId, cipher.seal(encodeCompanionMessage(desktopProtocol, {
          type: 'projection',
          projection: {
            type: 'transcript-page',
            sessionId: parseCompanionSessionId('session-keyless'),
            entries: [{
              type: 'text', entryId: parseCompanionTranscriptEntryId(`resync-${String(projectionRevision)}`),
              role: 'assistant', text: `desktop authoritative revision ${String(projectionRevision)}`,
            }],
          },
        })))
      },
      onCiphertext: async (ciphertext, sourceAttachmentId) => {
        const message = decodeCompanionMessage(desktopProtocol, cipher.open(ciphertext))
        if (message.type !== 'operation') return
        await desktopLifecycle.sendCiphertext(sourceAttachmentId, cipher.seal(encodeCompanionMessage(desktopProtocol, {
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
      attachTimeoutMs: config.attachTimeoutMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      reconnectDelayMs: config.reconnectDelayMs,
      onCiphertext: async (ciphertext) => {
        const message = decodeCompanionMessage(mobileProtocol, cipher.open(ciphertext))
        if (message.type === 'result') result.resolve(message.result.outcome)
        if (message.type === 'projection') {
          const entry = message.projection.entries[0]
          if (entry?.type === 'text') {
            const revision = Number(entry.entryId.replace('resync-', ''))
            mobileProjection = { revision, text: entry.text }
            if (revision === 2) failoverProjection.resolve()
          }
        }
      },
      onTransportError: (error) => { if (error.code === 'REMOTE_OFFLINE') offline.resolve(error.code) },
    })
    resources.add({ close: async () => { await mobile.stop() } })
    resources.add({ close: async () => { await desktopLifecycle.stop('quit') } })

    await mobile.start()
    await waitForDirectory(backendA.coordinator, routeId, mobileAttachmentId)
    desktopLifecycle.configure(grant)
    await desktopLifecycle.start()
    await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    const endpoint = new URL(loadBalancer.url)
    console.log(`PLATFORM endpointProtocol=${endpoint.protocol} endpointPath=${endpoint.pathname} endpointCount=1 nonSticky=${String(acquired[0] !== acquired[1])} mobile=${acquired[0]} desktop=${acquired[1]}`)

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
    await failoverProjection.promise
    const replacement = await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    if (mobileProjection?.revision !== 2 || mobileProjection.text !== 'desktop authoritative revision 2') {
      throw new Error('Mobile did not apply the Desktop-authoritative failover projection')
    }
    console.log(`FAILOVER liveSocketMigration=false desktopReconnect=${replacement.instanceId} mobileRevision=${String(mobileProjection.revision)} mobileText=${mobileProjection.text}`)

    const lifecycleOffline: DesktopRelayStopReason[] = []
    for (const reason of ['window-close', 'sleep', 'mobile-access-disabled', 'quit'] as const) {
      if (lifecycleOffline.length > 0) await desktopLifecycle.start()
      const attachment = desktopAttachmentId
      await desktopLifecycle.stop(reason)
      await waitUntil(async () => await backendA.coordinator.locate(routeId, attachment) === undefined)
      lifecycleOffline.push(reason)
    }
    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(Uint8Array.of(1)))
    console.log(`OFFLINE code=${await offline.promise} retainedCiphertextValues=${String(bus.retainedCiphertextValueCount())}`)
    console.log(`LIFECYCLE observed=${lifecycleOffline.join(',')} offline=${String(lifecycleOffline.length === 4)}`)

    const failClosed = new FailClosedDesktopRelayLifecycle('production crypto gate pending')
    let failed = false
    try { await failClosed.start() } catch { failed = true }
    await failClosed.stop('quit')
    console.log(`CRYPTO startRejected=${String(failed)} connected=${String(failClosed.getState().connected)} stop=${failClosed.getState().stopReason}`)
  })
}

interface Backend {
  id: string
  provider: RemoteRelayProvider
  coordinator: RedisRelayCoordinator
  consumer: RelayWebSocketConsumer
  available(): boolean
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
      deliveryAckTimeoutMs: config.deliveryAckTimeoutMs,
      directoryTtlMs: config.directoryTtlMs,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs,
      maxBufferedCiphertextBytes: config.maxBufferedCiphertextBytes,
      maxConnections: config.maxConnections,
      maxPendingDeliveries: config.maxPendingDeliveries,
    },
    randomBytes: size => new Uint8Array(size).fill(randomByte),
  })
  const consumer = new RelayWebSocketConsumer(ctx, config.attachTimeoutMs)
  let open = true
  return {
    id, provider, coordinator, consumer,
    available: () => open,
    close: async () => {
      if (!open) return
      open = false
      const results = await Promise.allSettled([consumer.close(), provider.dispose()])
      throwRejected(results, `Relay backend ${id} failed to close`)
    },
  }
}

async function startLoadBalancer(backends: Backend[], acquired: string[]): Promise<{ url: string; close(): Promise<void> }> {
  const [key, cert] = await Promise.all([
    readFile(`${FIXTURES}localhost-key.pem`),
    readFile(`${FIXTURES}localhost-cert.pem`),
  ])
  const server = createServer({ key, cert }, (_request, response) => { response.writeHead(404); response.end() })
  let acquisition = 0
  server.on('upgrade', (request, socket, head) => {
    const live = backends.filter(backend => backend.available())
    const backend = live[acquisition++ % live.length]
    if (backend === undefined) { socket.destroy(); return }
    acquired.push(backend.id)
    backend.consumer.handleUpgrade(request, socket, head)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
  } catch (error) {
    await closeServer(server).catch(() => {})
    throw error
  }
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Relay TLS load balancer did not bind a TCP port')
  }
  let open = true
  return {
    url: `wss://127.0.0.1:${String(address.port)}/v1/remote-access/relay`,
    close: async () => {
      if (!open) return
      open = false
      await closeServer(server)
    },
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
      ? route.revision : undefined
  }
  async revoke(routeId: RelayRouteId): Promise<number> {
    const revision = (this.routes.get(routeId)?.revision ?? 0) + 1
    this.routes.set(routeId, { digest: '', revision, revoked: true })
    return revision
  }
}

class KeylessRedisBus {
  readonly published: string[] = []
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
  retainedCiphertextValueCount(): number {
    return [...this.values.values()].filter(value => value.includes('ciphertext')).length
  }
}

/** Staged owner that aggregates partial-acquisition and cleanup failures. */
export class KeylessResourceOwner {
  private readonly resources: Array<{ close(): Promise<void> }> = []
  /** @param resource - successfully acquired resource transferred to this owner. @returns the same resource. */
  add<T extends { close(): Promise<void> }>(resource: T): T { this.resources.push(resource); return resource }
  /** Close every acquired resource in reverse acquisition order. */
  async close(): Promise<void> {
    const results = await Promise.allSettled(this.resources.splice(0).reverse().map(async (resource) => { await resource.close() }))
    throwRejected(results, 'Two-instance Relay resource cleanup failed')
  }
}

/** Run staged acquisition and aggregate the work failure with every cleanup failure. */
export async function withResources(work: (owner: KeylessResourceOwner) => Promise<void>): Promise<void> {
  const owner = new KeylessResourceOwner()
  const workResult = await Promise.allSettled([work(owner)])
  const cleanupResult = await Promise.allSettled([owner.close()])
  throwRejected([...workResult, ...cleanupResult], 'Two-instance Relay scenario failed')
}

/** Validate cross-field timing and queue relationships before resource acquisition. */
export function validateBundledConfig(config: Config): void {
  if (config.heartbeatIntervalMs >= Math.min(config.directoryTtlMs, config.heartbeatTimeoutMs)) {
    throw new TypeError('Relay heartbeatIntervalMs must be less than directoryTtlMs and heartbeatTimeoutMs')
  }
  if (config.inboundMaxBytes < REMOTE_PROTOCOL_LIMITS.relayMessageBytes) {
    throw new TypeError('Relay inboundMaxBytes must admit one maximum Relay message')
  }
}

async function waitForDirectory(
  coordinator: RelayCoordinator,
  routeId: RelayRouteId,
  attachmentId: RelayAttachmentId,
): Promise<RelayDirectoryEntry> {
  let found: RelayDirectoryEntry | undefined
  await waitUntil(async () => { found = await coordinator.locate(routeId, attachmentId); return found !== undefined })
  if (found === undefined) throw new Error('Relay directory entry disappeared')
  return found
}

async function waitUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Relay keyless scenario timed out')
    await new Promise<void>((resolve) => { setTimeout(resolve, 5) })
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
}

function throwRejected(results: PromiseSettledResult<unknown>[], message: string): void {
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason)
  }
  if (errors.length === 1) throw errorFromUnknown(errors[0])
  if (errors.length > 1) throw new AggregateError(errors, message)
}

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}
