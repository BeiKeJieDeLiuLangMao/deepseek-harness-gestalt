import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:https'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import {
  MemoryPersonalPairingAuthorityStore,
  PersonalPairingProvider,
  parseRelayInstanceId,
  type RelayCoordinator,
  type RelayDirectoryEntry,
  type RelayRouteStore,
  type RemoteRelayConfig,
} from '@deepseek-ai/dsh-remote-access'
import { parseAccountProofJti, parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
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
  parseRelayCredential,
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
    const pairingAuthority = new MemoryPersonalPairingAuthorityStore()
    let pairingId = 0
    const createPairingProvider = (relay: RemoteRelayProvider) => new PersonalPairingProvider(new Context(), {
      account: {
        currentInstallation: async ({ accessToken }) => {
          const [kind, id] = accessToken.split(':') as ['desktop' | 'mobile', string]
          return {
            account: {
              id: parsePlatformAccountId('account-keyless'), githubId: 1, githubLogin: 'keyless',
              avatarUrl: 'https://avatars.example/keyless',
            },
            installation: { id: parseInstallationId(id), kind },
          }
        },
      },
      handshake: {
        createChallenge: async () => ({ desktopFingerprint: 'desktop-keyless', state: Uint8Array.of(1) }),
        completeChallenge: async () => ({
          handshakeHash: new Uint8Array(32), desktopHandshake: Uint8Array.of(2), pendingPairingKey: Uint8Array.of(3),
        }),
        activatePairing: async () => ({ keyReference: 'keyless-active' as never, activePairingKey: Uint8Array.of(4) }),
        sealMobileRelayAuthority: async ({ grant }) => new TextEncoder().encode(JSON.stringify(grant)),
        destroyChallenge: () => {}, destroyPendingPairing: () => {}, destroyPairing: () => {},
      },
      relay,
      authority: pairingAuthority,
      randomBytes: size => new Uint8Array(size).fill(41),
      randomId: kind => kind === 'relay-route' ? 'route-keyless' : `${kind}-keyless-${String(++pairingId)}`,
      pairingLinkOrigin: 'https://platform.example/pair',
    })
    const pairingA = createPairingProvider(backendA.provider)
    const pairingB = createPairingProvider(backendB.provider)
    resources.add({ close: async () => { await pairingA.dispose() } })
    resources.add({ close: async () => { await pairingB.dispose() } })
    const authentication = (kind: 'desktop' | 'mobile', id: string) => ({
      accessToken: `${kind}:${id}`,
      proof: { jti: parseAccountProofJti(`${kind}-${id}`), issuedAt: 1, signature: 'keyless' },
    })
    const desktopAuthentication = authentication('desktop', 'desktop-keyless')
    const mobileAuthentication = authentication('mobile', 'mobile-keyless')
    const desktopAccess = await pairingA.setMobileAccess({ desktop: desktopAuthentication, enabled: true })
    if (desktopAccess.relay === undefined) throw new Error('Desktop product flow did not issue Relay authority')
    const challenge = await pairingA.createChallenge({
      desktop: desktopAuthentication, rendezvousId: 'rendezvous-keyless' as never,
    })
    const pending = await pairingA.completeChallenge({
      mobile: mobileAuthentication,
      completionId: 'completion-keyless' as never,
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Keyless phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(5),
    })
    await pairingA.confirmPairing({ desktop: desktopAuthentication, pendingPairingId: pending.pendingPairingId })
    const mobileStatus = await pairingB.getMobilePairingStatus({
      mobile: mobileAuthentication, pendingPairingId: pending.pendingPairingId,
    })
    if (mobileStatus.status !== 'paired' || mobileStatus.sealedRelayAuthority === undefined) {
      throw new Error('Mobile product flow did not receive paired Relay authority')
    }
    const mobileGrant = parseKeylessRelayAuthority(mobileStatus.sealedRelayAuthority)
    const routeId = desktopAccess.relay.routeId
    await pairingA.dispose()
    const replacementAccess = await pairingB.getMobileAccessState(desktopAuthentication)
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
      route: async () => mobileGrant,
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
    desktopLifecycle.configure(desktopAccess.relay)
    await desktopLifecycle.start()
    await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    const endpoint = new URL(loadBalancer.url)
    const endpointCount = new Set([loadBalancer.url]).size
    console.log(`PLATFORM endpointProtocol=${endpoint.protocol} endpointPath=${endpoint.pathname} endpointCount=${String(endpointCount)} nonSticky=${String(acquired[0] !== acquired[1])} mobile=${acquired[0]} desktop=${acquired[1]} productAuthority=${String(replacementAccess.enabled)} distinctCredentials=${String(desktopAccess.relay.credential !== mobileGrant.credential)}`)

    const prompt = 'continue from Mobile across instances'
    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(encodeCompanionMessage(mobileProtocol, {
      type: 'operation',
      operation: {
        type: 'submit-prompt', operationId: parseCompanionOperationId('operation-keyless'),
        sessionId: parseCompanionSessionId('session-keyless'), text: prompt,
      },
    })))
    const outcome = await result.promise
    const relayBusinessValue = bus.published.some(value => value.includes(prompt))
    const encrypted = !relayBusinessValue
    console.log(`ROUND_TRIP encrypted=${String(encrypted)} relayBusinessValue=${String(relayBusinessValue)} outcome=${outcome}`)

    await backendB.close()
    await failoverProjection.promise
    const replacement = await waitForDirectory(backendA.coordinator, routeId, desktopAttachmentId)
    if (mobileProjection?.revision !== 2 || mobileProjection.text !== 'desktop authoritative revision 2') {
      throw new Error('Mobile did not apply the Desktop-authoritative failover projection')
    }
    const liveSocketMigration = desktopGeneration === 1
    console.log(`FAILOVER liveSocketMigration=${String(liveSocketMigration)} desktopReconnect=${replacement.instanceId} mobileRevision=${String(mobileProjection.revision)} mobileText=${mobileProjection.text}`)

    const lifecycleOffline: DesktopRelayStopReason[] = []
    const lifecyclePresence: boolean[] = []
    for (const reason of ['window-close', 'sleep', 'mobile-access-disabled', 'quit'] as const) {
      if (lifecycleOffline.length > 0) await desktopLifecycle.start()
      const attachment = desktopAttachmentId
      await desktopLifecycle.stop(reason)
      await waitUntil(async () => await backendA.coordinator.locate(routeId, attachment) === undefined)
      lifecycleOffline.push(reason)
      lifecyclePresence.push(await backendA.coordinator.locate(routeId, attachment) !== undefined)
    }
    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(Uint8Array.of(1)))
    console.log(`OFFLINE code=${await offline.promise} retainedCiphertextValues=${String(bus.retainedCiphertextValueCount())}`)
    console.log(`LIFECYCLE observed=${lifecycleOffline.join(',')} offline=${String(lifecyclePresence.every(present => !present))}`)
    const pairingReplacement = createPairingProvider(backendA.provider)
    resources.add({ close: async () => { await pairingReplacement.dispose() } })
    await pairingReplacement.setMobileAccess({ desktop: desktopAuthentication, enabled: false })
    await waitUntil(async () => await backendA.coordinator.locate(routeId, mobileAttachmentId) === undefined)
    const routeOffline = await backendA.coordinator.locate(routeId, mobileAttachmentId) === undefined
    console.log(`AUTHORITY disableInstance=platform-replacement routeOffline=${String(routeOffline)}`)

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
  let entropyAllocation = 0
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
    randomBytes: (size) => {
      entropyAllocation += 1
      return new Uint8Array(size).fill((randomByte + entropyAllocation) % 256)
    },
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
  private readonly routes = new Map<string, {
    authorities: Map<string, 'mobile' | 'desktop'>
    revision: number
    revoked: boolean
  }>()
  async rotate(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array): Promise<number> {
    const revision = (this.routes.get(routeId)?.revision ?? 0) + 1
    const authorities = new Map(this.routes.get(routeId)?.authorities ?? [])
    for (const [value, owner] of authorities) if (owner === endpoint) authorities.delete(value)
    authorities.set(Buffer.from(digest).toString('hex'), endpoint)
    this.routes.set(routeId, { authorities, revision, revoked: false })
    return revision
  }
  async issue(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array): Promise<number | undefined> {
    const route = this.routes.get(routeId)
    if (route === undefined || route.revoked) return undefined
    route.authorities.set(Buffer.from(digest).toString('hex'), endpoint)
    return route.revision
  }
  async authorize(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array): Promise<number | undefined> {
    const route = this.routes.get(routeId)
    return route !== undefined && !route.revoked
      && route.authorities.get(Buffer.from(digest).toString('hex')) === endpoint
      ? route.revision : undefined
  }
  async revokeCredential(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    digest: Uint8Array,
  ): Promise<number> {
    const current = this.routes.get(routeId)
    const revision = (current?.revision ?? 0) + 1
    const authorities = new Map(current?.authorities ?? [])
    const encoded = Buffer.from(digest).toString('hex')
    if (authorities.get(encoded) === endpoint) authorities.delete(encoded)
    this.routes.set(routeId, { authorities, revision, revoked: current?.revoked ?? true })
    return revision
  }
  async revoke(routeId: RelayRouteId): Promise<number> {
    const revision = (this.routes.get(routeId)?.revision ?? 0) + 1
    this.routes.set(routeId, { authorities: new Map(), revision, revoked: true })
    return revision
  }
}

class KeylessRedisBus {
  readonly published: string[] = []
  private readonly values = new Map<string, string>()
  private readonly subscriptions = new Map<string, Set<(message: string) => void>>()
  client(): RelayRedisClient {
    const client: RelayRedisClient = {
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
      withAbortSignal: () => client,
    }
    return client
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

function parseKeylessRelayAuthority(value: Uint8Array) {
  const decoded = JSON.parse(new TextDecoder().decode(value)) as unknown
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new TypeError('Keyless Mobile Relay authority must be an object')
  }
  const record = decoded as Record<string, unknown>
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) <= 0) {
    throw new TypeError('Keyless Mobile Relay revision must be positive')
  }
  return {
    routeId: parseRelayRouteId(record.routeId),
    credential: parseRelayCredential(record.credential),
    revision: record.revision as number,
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
