/** REAL Loader composition: two Platform Instances share test adapters and one TLS endpoint. */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { createServer } from 'node:https'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import {
  parseAccountProofJti,
  parseInstallationId,
  parsePlatformAccountId,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
} from '@deepseek-ai/dsh-platform-account'
import {
  MemoryPersonalPairingAuthorityStore,
  PersonalPairingProvider,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  parsePersonalPairingKeyReference,
  parseRelayInstanceId,
  type RelayRouteStore,
} from '@deepseek-ai/dsh-remote-access'
import { RemoteRelayProvider } from '@deepseek-ai/dsh-remote-access/relay-provider'
import {
  RemoteAccessHttpTransport,
  RemoteRelayEndpointController,
} from '@deepseek-ai/dsh-remote-access-client'
import { DesktopRelayEndpointLifecycle } from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'
import { NodeRelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client/node-relay-socket'
import { RedisRelayCoordinator, type RelayRedisClient } from '@deepseek-ai/dsh-remote-access-redis'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  decodeCompanionMessage,
  decodeRelayMessage,
  deriveRelayCredentialPublicKey,
  encodeCompanionMessage,
  encodeRelayMessage,
  generateRelayCredential,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseCompanionTranscriptEntryId,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayCredential,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  type RelayAttachmentId,
  type RelayCiphertextMessage,
  type RelayPairingSelector,
  type RelayRouteId,
  signRelayAttachmentChallenge,
} from '@deepseek-ai/dsh-remote-protocol'
import WebSocket from 'ws'
import * as RemoteAccessHttp from '../src/index.ts'
import * as RemoteAccessRelay from '../src/relay.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const ORIGIN = 'https://platform.dev.example.com'
const PROMPT = 'continue from Mobile across Loader instances'
const ENVIRONMENT = selectPlatformEnvironment(validatePlatformEnvironmentPair({
  development: {
    environment: 'development',
    origin: ORIGIN,
    callbackUrl: `${ORIGIN}/v1/account/oauth/github/callback`,
    githubClientId: 'assembled-development',
    credentialReference: 'credentials://development',
    databaseIdentity: 'assembled-database-development',
    identityNamespace: 'assembled-development',
  },
  production: {
    environment: 'production',
    origin: 'https://platform.example.com',
    callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
    githubClientId: 'assembled-production',
    credentialReference: 'credentials://production',
    databaseIdentity: 'assembled-database-production',
    identityNamespace: 'assembled-production',
  },
}), 'development')
const RELAY_CONFIG = {
  capacityRetryAfterMs: 100,
  deliveryAckTimeoutMs: 500,
  directoryTtlMs: 2_000,
  heartbeatTimeoutMs: 1_000,
  maxBufferedCiphertextBytes: 131_070,
  maxConnections: 16,
  maxPendingDeliveries: 16,
} as const
const CLIENT = {
  attachTimeoutMs: 1_000,
  heartbeatIntervalMs: 50,
  reconnectDelayMs: 10,
  inboundMaxBytes: REMOTE_PROTOCOL_LIMITS.relayMessageBytes,
  inboundMaxMessages: 16,
} as const
const FORBIDDEN_REDIS_APIS = [
  'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'llen', 'ltrim',
  'xadd', 'xread', 'xreadgroup', 'xgroup', 'xack', 'xdel', 'xrange', 'xrevrange', 'xlen',
] as const

function rejectedReasons(results: PromiseSettledResult<unknown>[]): unknown[] {
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown)
  }
  return errors
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  const results = await Promise.allSettled(cleanups.splice(0).reverse().map(async (close) => { await close() }))
  const errors = rejectedReasons(results)
  if (errors.length > 0) throw new AggregateError(errors, 'two-instance assembled cleanup failed')
}, 30_000)

describe('two Loader-booted Platform Instances', () => {
  it('routes one encrypted pair across a non-sticky TLS endpoint and recovers after instance loss', {
    timeout: 90_000,
  }, async () => {
    const bus = new AssembledRedisBus()
    const shared = {
      authority: new MemoryPersonalPairingAuthorityStore(),
      routeStore: new AssembledRouteStore(),
      coordinator: new RedisRelayCoordinator({
        command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:assembled:relay',
      }),
    }
    const instanceA = await withPhase('load platform-a', loadInstance('platform-a', shared, 11))
    const instanceB = await withPhase('load platform-b', loadInstance('platform-b', shared, 29))
    const acquired: string[] = []
    const endpoint = await withPhase('listen TLS endpoint', startNonStickyTlsEndpoint([instanceA, instanceB], acquired))
    const desktopAuth = authentication('desktop', 'desktop-assembled')
    const mobileAuth = authentication('mobile', 'mobile-assembled')
    const desktopTransport = new RemoteAccessHttpTransport({
      environment: ENVIRONMENT,
      fetch: rewriteFetch(ORIGIN, instanceA.port),
    })
    const mobileTransport = new RemoteAccessHttpTransport({
      environment: ENVIRONMENT,
      fetch: rewriteFetch(ORIGIN, instanceB.port),
    })

    const enabled = await withPhase('enable Mobile Access', desktopTransport.setMobileAccess({
      authentication: desktopAuth, enabled: true,
    }))
    expect(enabled.enabled).toBe(true)
    if (enabled.relay === undefined) throw new Error('Desktop enable did not issue Relay authority')
    const challenge = await withPhase('create challenge', desktopTransport.createChallenge({
      authentication: desktopAuth, rendezvousId: parsePairingRendezvousId('rendezvous-assembled'),
    }))
    const pending = await withPhase('complete challenge', mobileTransport.completeChallenge({
      authentication: mobileAuth,
      completionId: parsePairingCompletionId('completion-assembled'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Assembled phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(5),
    }))
    await withPhase('confirm pairing', desktopTransport.confirmPairing({
      authentication: desktopAuth, pendingPairingId: pending.pendingPairingId,
    }))
    const mobileStatus = await withPhase('read sealed grant on instance B', mobileTransport.getMobilePairingStatus({
      authentication: mobileAuth, pendingPairingId: pending.pendingPairingId,
    }))
    if (mobileStatus.status !== 'paired' || mobileStatus.sealedRelayAuthority === undefined) {
      throw new Error('Mobile status on the second instance did not carry sealed Relay authority')
    }
    const mobileGrant = parseSealedGrant(mobileStatus.sealedRelayAuthority)
    const routeId = enabled.relay.routeId
    expect(mobileGrant.routeId).toBe(routeId)
    expect(mobileGrant.credential).not.toBe(enabled.relay.credential)

    const rejected = await withPhase('reject route-id-only attach', attachWithCredential(
      endpoint.url,
      routeId,
      parseRelayAttachmentId('intruder-assembled'),
      'desktop',
      await generateRelayCredential(),
    ))
    expect(rejected).toMatchObject({ type: 'error', code: 'RELAY_ATTACHMENT_REJECTED' })
    const direct = await withPhase('direct WebServer attach', attachWithCredential(
      `ws://127.0.0.1:${String(instanceA.port)}/v1/remote-access/relay`,
      routeId,
      parseRelayAttachmentId('direct-assembled'),
      'desktop',
      await generateRelayCredential(),
    ))
    expect(direct).toMatchObject({ type: 'error', code: 'RELAY_ATTACHMENT_REJECTED' })
    acquired.length = 0
    endpoint.resetAcquisition()

    const cipher = new AssembledCipher()
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
    const mobileAttachmentId = parseRelayAttachmentId('mobile-assembled')
    let desktopAttachmentId = parseRelayAttachmentId('desktop-assembled-0')
    let desktopGeneration = 0
    let projectionRevision = 0
    let mobileProjection: { revision: number; text: string } | undefined
    const failover = deferred<'resync'>()
    const accepted = deferred<'accepted'>()
    const offline = deferred<string>()
    const connectEndpoint = async (signal: AbortSignal) => await NodeRelayEndpointSocket.connect(
      endpoint.url,
      signal,
      { maxBytes: CLIENT.inboundMaxBytes, maxMessages: CLIENT.inboundMaxMessages },
      { rejectUnauthorized: false },
    )
    const desktop = new DesktopRelayEndpointLifecycle({
      attachmentId: () => {
        desktopGeneration += 1
        desktopAttachmentId = parseRelayAttachmentId(`desktop-assembled-${String(desktopGeneration)}`)
        return desktopAttachmentId
      },
      connect: connectEndpoint,
      attachTimeoutMs: CLIENT.attachTimeoutMs,
      heartbeatIntervalMs: CLIENT.heartbeatIntervalMs,
      reconnectDelayMs: CLIENT.reconnectDelayMs,
      resynchronize: async (send) => {
        projectionRevision += 1
        await send(mobileAttachmentId, cipher.seal(encodeCompanionMessage(desktopProtocol, {
          type: 'projection',
          projection: {
            type: 'transcript-page',
            sessionId: parseCompanionSessionId('session-assembled'),
            entries: [{
              type: 'text',
              entryId: parseCompanionTranscriptEntryId(`resync-${String(projectionRevision)}`),
              role: 'assistant',
              text: `desktop authoritative revision ${String(projectionRevision)}`,
            }],
          },
        })))
      },
      onCiphertext: async (ciphertext, sourceAttachmentId) => {
        const message = decodeCompanionMessage(desktopProtocol, cipher.open(ciphertext))
        if (message.type !== 'operation') return
        await desktop.sendCiphertext(parseRelayPairingSelector('pairing-assembled'), sourceAttachmentId,
          cipher.seal(encodeCompanionMessage(desktopProtocol, {
            type: 'result',
            result: {
              type: 'confirmed',
              operationId: message.operation.operationId,
              committedAt: 1_787_027_200_000,
              outcome: 'accepted',
            },
          })))
      },
    })
    const mobile = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => mobileGrant,
      attachmentId: () => mobileAttachmentId,
      connect: connectEndpoint,
      attachTimeoutMs: CLIENT.attachTimeoutMs,
      heartbeatIntervalMs: CLIENT.heartbeatIntervalMs,
      reconnectDelayMs: CLIENT.reconnectDelayMs,
      onCiphertext: async (ciphertext) => {
        const message = decodeCompanionMessage(mobileProtocol, cipher.open(ciphertext))
        if (message.type === 'result' && message.result.type === 'confirmed') {
          accepted.resolve(message.result.outcome)
        }
        if (message.type === 'projection' && message.projection.type === 'transcript-page') {
          const entry = message.projection.entries[0]
          if (entry?.type === 'text') {
            const revision = Number(entry.entryId.replace('resync-', ''))
            mobileProjection = { revision, text: entry.text }
            if (revision === 2) failover.resolve('resync')
          }
        }
      },
      onTransportError: (error) => {
        if (error.code === 'REMOTE_OFFLINE') offline.resolve(error.code)
      },
    })
    cleanups.push(async () => { await mobile.stop() })
    cleanups.push(async () => { await desktop.stop('quit') })

    await withPhase('mobile start', mobile.start())
    await withPhase('mobile directory', waitForDirectory(shared.coordinator, routeId, mobileAttachmentId))
    desktop.configure(enabled.relay)
    await withPhase('desktop start', desktop.start())
    await withPhase('desktop directory', waitForDirectory(shared.coordinator, routeId, desktopAttachmentId))
    expect(new URL(endpoint.url).protocol).toBe('wss:')
    expect(new URL(endpoint.url).pathname).toBe('/v1/remote-access/relay')
    expect(acquired[0]).not.toBe(acquired[1])
    expect(new Set(acquired.slice(0, 2))).toEqual(new Set(['platform-a', 'platform-b']))

    await mobile.sendCiphertext(desktopAttachmentId, cipher.seal(encodeCompanionMessage(mobileProtocol, {
      type: 'operation',
      operation: {
        type: 'submit-prompt',
        operationId: parseCompanionOperationId('operation-assembled'),
        sessionId: parseCompanionSessionId('session-assembled'),
        text: PROMPT,
      },
    })))
    expect(await withPhase('encrypted round trip', accepted.promise)).toBe('accepted')
    const forwarded = publishedCiphertextFrames(bus.published)
    expect(forwarded.length).toBeGreaterThan(0)
    for (const frame of forwarded) {
      expect(frame.type).toBe('ciphertext')
      expect(ciphertextCarriesCompanionPrompt(frame.ciphertext, mobileProtocol)).toBe(false)
    }
    bus.assertNoRetainedCiphertextFrames()

    await instanceB.dispose()
    await withPhase('desktop authoritative resync', failover.promise)
    const replacement = await withPhase(
      'replacement directory',
      waitForDirectory(shared.coordinator, routeId, desktopAttachmentId),
    )
    expect(desktopGeneration).toBeGreaterThan(1)
    expect(replacement.instanceId).toBe('platform-a')
    expect(mobileProjection).toEqual({
      revision: 2, text: 'desktop authoritative revision 2',
    })

    let restarted = false
    for (const reason of ['window-close', 'sleep', 'mobile-access-disabled', 'quit'] as const) {
      if (restarted) await desktop.start()
      const attachment = desktopAttachmentId
      await desktop.stop(reason)
      await waitUntil(async () => await shared.coordinator.locate(routeId, attachment) === undefined)
      restarted = true
    }
    await withPhase(
      'offline ciphertext send',
      mobile.sendCiphertext(desktopAttachmentId, cipher.seal(Uint8Array.of(1))),
    )
    expect(await withPhase('offline observation', offline.promise)).toBe('REMOTE_OFFLINE')
    bus.assertNoRetainedCiphertextFrames()

    await desktopTransport.setMobileAccess({ authentication: desktopAuth, enabled: false })
    await waitUntil(async () => await shared.coordinator.locate(routeId, mobileAttachmentId) === undefined)
    expect(await shared.coordinator.locate(routeId, mobileAttachmentId)).toBeUndefined()
  })
})

interface SharedAdapters {
  authority: MemoryPersonalPairingAuthorityStore
  routeStore: RelayRouteStore
  coordinator: RedisRelayCoordinator
}

interface InstanceHandle {
  id: string
  context: Context
  port: number
  available: boolean
  dispose(): Promise<void>
}

async function loadInstance(id: string, shared: SharedAdapters, entropy: number): Promise<InstanceHandle> {
  const root = await mkdtemp(join(tmpdir(), `dsh-two-instance-${id}-`))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: 'assembled-platform-instance'",
    "- name: '@deepseek-ai/dsh-remote-access-http'",
    '  config:',
    `    origin: '${ORIGIN}'`,
    "- name: '@deepseek-ai/dsh-remote-access-http/relay'",
    '  config:',
    "    path: '/v1/remote-access/relay'",
    '    attachTimeoutMs: 1000',
    '    maxPendingChallenges: 16',
    '',
  ].join('\n'))
  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['assembled-platform-instance', instanceProvider(id, shared, entropy)],
    ['@deepseek-ai/dsh-remote-access-http', RemoteAccessHttp],
    ['@deepseek-ai/dsh-remote-access-http/relay', RemoteAccessRelay],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  const webServer = context.get('webServer')
  if (webServer === undefined || typeof webServer.port !== 'number') {
    throw new Error(`${id} exposed no WebServer port`)
  }
  let disposed = false
  const handle: InstanceHandle = {
    id,
    context,
    port: webServer.port,
    available: true,
    async dispose() {
      if (disposed) return
      disposed = true
      handle.available = false
      const results = await Promise.allSettled([
        context.fiber.dispose(),
        rm(root, { recursive: true, force: true }),
      ])
      const errors = rejectedReasons(results)
      if (errors.length > 0) throw new AggregateError(errors, `${id} assembled instance dispose failed`)
    },
  }
  cleanups.push(async () => { await handle.dispose() })
  return handle
}

function instanceProvider(id: string, shared: SharedAdapters, entropy: number): unknown {
  return {
    name: 'assembled-platform-instance',
    apply(ctx: Context) {
      const relay = new RemoteRelayProvider(ctx, {
        instanceId: parseRelayInstanceId(id),
        routeStore: shared.routeStore,
        coordinator: shared.coordinator,
        config: RELAY_CONFIG,
        randomBytes: (size) => {
          const bytes = randomBytes(size)
          bytes[0] = entropy
          return bytes
        },
      })
      new PersonalPairingProvider(ctx, {
        account: {
          currentInstallation: async ({ accessToken }) => {
            const [kind, installation] = accessToken.split(':') as ['desktop' | 'mobile', string]
            return {
              account: {
                id: parsePlatformAccountId('account-assembled'),
                githubId: 1,
                githubLogin: 'assembled',
                avatarUrl: 'https://avatars.example/assembled',
              },
              installation: { id: parseInstallationId(installation), kind },
            }
          },
        },
        handshake: {
          createChallenge: async () => ({ desktopFingerprint: 'desktop-assembled', state: Uint8Array.of(1) }),
          completeChallenge: async () => ({
            handshakeHash: new Uint8Array(32),
            desktopHandshake: Uint8Array.of(2),
            pendingPairingKey: Uint8Array.of(3),
          }),
          activatePairing: async () => ({
            keyReference: parsePersonalPairingKeyReference('assembled-active'),
            activePairingKey: Uint8Array.of(4),
          }),
          sealMobileRelayAuthority: async ({ grant }) => new TextEncoder().encode(JSON.stringify(grant)),
          destroyChallenge: () => {},
          destroyPendingPairing: () => {},
          destroyPairing: () => {},
        },
        relay,
        authority: shared.authority,
        randomBytes: size => new Uint8Array(size).fill(41),
        randomId: kind => `${kind}-${id}-${crypto.randomUUID()}`,
        pairingLinkOrigin: 'https://platform.example/pair',
      })
    },
  }
}

async function startNonStickyTlsEndpoint(
  instances: InstanceHandle[],
  acquired: string[],
): Promise<{ url: string; resetAcquisition(): void }> {
  const [key, cert] = await Promise.all([
    readFile(`${FIXTURES}localhost-key.pem`),
    readFile(`${FIXTURES}localhost-cert.pem`),
  ])
  const server = createServer({ key, cert }, (_request, response) => { response.writeHead(404); response.end() })
  const backends = new Set<Socket>()
  const frontends = new Set<Duplex>()
  let next = 0
  server.on('upgrade', (request, socket, head) => {
    const live = instances.filter(instance => instance.available)
    const instance = live[next++ % live.length]
    if (instance === undefined) { socket.destroy(); return }
    acquired.push(instance.id)
    frontends.add(socket)
    socket.once('close', () => { frontends.delete(socket) })
    proxyHttpUpgrade(request, socket, head, instance.port, backends)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('assembled TLS endpoint did not bind a TCP port')
  }
  cleanups.push(async () => {
    for (const frontend of frontends) frontend.destroy()
    for (const backend of backends) backend.destroy()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { resolve() }, 1_000)
      server.close((error) => {
        clearTimeout(timer)
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  })
  return {
    url: `wss://127.0.0.1:${String(address.port)}/v1/remote-access/relay`,
    resetAcquisition() { next = 0 },
  }
}

function proxyHttpUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
  backends: Set<Socket>,
): void {
  const backend = connect({ host: '127.0.0.1', port })
  backends.add(backend)
  backend.once('close', () => { backends.delete(backend) })
  backend.once('connect', () => {
    let block = `${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/1.1\r\n`
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined) continue
      for (const item of Array.isArray(value) ? value : [value]) block += `${name}: ${item}\r\n`
    }
    backend.write(`${block}\r\n`)
    if (head.byteLength > 0) backend.write(head)
    backend.pipe(socket)
    socket.pipe(backend)
  })
  backend.on('error', () => { socket.destroy() })
  socket.on('error', () => { backend.destroy() })
}

async function attachWithCredential(
  url: string,
  routeId: RelayRouteId,
  attachmentId: RelayAttachmentId,
  endpoint: 'mobile' | 'desktop',
  credential: ReturnType<typeof parseRelayCredential>,
): Promise<ReturnType<typeof decodeRelayMessage>> {
  const socket = new WebSocket(url, url.startsWith('wss:') ? { rejectUnauthorized: false } : undefined)
  await once(socket, 'open')
  const challengeMessage = once(socket, 'message') as Promise<[WebSocket.RawData]>
  socket.send(encodeRelayMessage({
    type: 'attach-challenge', transportVersion: 1, routeId, attachmentId, endpoint,
    credentialPublicKey: await deriveRelayCredentialPublicKey(credential),
  }))
  const [challengeData] = await challengeMessage
  const challenge = decodeRelayMessage(bytes(challengeData))
  if (challenge.type !== 'attach-challenge-response') throw new Error('Relay did not issue an attach challenge')
  const received = once(socket, 'message') as Promise<[WebSocket.RawData]>
  socket.send(encodeRelayMessage(await signRelayAttachmentChallenge(credential, challenge)))
  const [data] = await received
  socket.close()
  return decodeRelayMessage(bytes(data))
}

function authentication(kind: 'desktop' | 'mobile', id: string) {
  return {
    accessToken: `${kind}:${id}`,
    proof: { jti: parseAccountProofJti(`${kind}-${id}`), issuedAt: 1, signature: 'assembled' },
  }
}

function rewriteFetch(origin: string, port: number): typeof fetch {
  return async (input, init = {}) => {
    const source = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init.headers)
    headers.set('origin', origin)
    return fetch(`http://127.0.0.1:${String(port)}${source.pathname}${source.search}`, { ...init, headers })
  }
}

function parseSealedGrant(value: Uint8Array) {
  const decoded = JSON.parse(new TextDecoder().decode(value)) as Record<string, unknown>
  return {
    routeId: parseRelayRouteId(decoded.routeId),
    credential: parseRelayCredential(decoded.credential),
    revision: decoded.revision as number,
  }
}

function publishedCiphertextFrames(published: readonly string[]): RelayCiphertextMessage[] {
  const frames: RelayCiphertextMessage[] = []
  for (const value of published) {
    const record = JSON.parse(value) as Record<string, unknown>
    if (record.type !== 'ciphertext') continue
    if (typeof record.frame !== 'string') throw new Error('Relay publish event omitted its ciphertext frame')
    const message = decodeRelayMessage(Uint8Array.from(Buffer.from(record.frame, 'base64url')))
    if (message.type !== 'ciphertext') throw new Error('Relay publish frame was not ciphertext')
    frames.push(message)
  }
  return frames
}

function ciphertextCarriesCompanionPrompt(
  ciphertext: Uint8Array,
  protocol: ReturnType<typeof negotiateCompanionProtocol>,
): boolean {
  const text = new TextDecoder().decode(ciphertext)
  if (text.includes(PROMPT)) return true
  try {
    const message = decodeCompanionMessage(protocol, ciphertext)
    return JSON.stringify(message).includes(PROMPT)
  } catch {
    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null && JSON.stringify(parsed).includes(PROMPT)
    } catch {
      return false
    }
  }
}

async function waitForDirectory(
  coordinator: RedisRelayCoordinator,
  routeId: RelayRouteId,
  attachmentId: RelayAttachmentId,
) {
  let found: Awaited<ReturnType<RedisRelayCoordinator['locate']>>
  await waitUntil(async () => {
    found = await coordinator.locate(routeId, attachmentId)
    return found !== undefined
  })
  if (found === undefined) throw new Error('Relay directory entry disappeared')
  return found
}

function withPhase<T>(phase: string, operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error(`two-instance assembled phase timed out: ${phase}`)) }, 10_000)
  })
  return Promise.race([operation, timeout]).finally(() => { clearTimeout(timer) })
}

async function waitUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 8_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('two-instance assembled wait timed out')
    await new Promise<void>((resolve) => { setTimeout(resolve, 15) })
  }
}

function bytes(data: WebSocket.RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

class AssembledCipher {
  private readonly key = Buffer.alloc(32, 29)
  private counter = 0

  seal(plaintext: Uint8Array): Uint8Array {
    this.counter += 1
    const nonce = Buffer.alloc(12)
    nonce.writeUInt32BE(this.counter, 8)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return new Uint8Array(Buffer.concat([nonce, encrypted, cipher.getAuthTag()]))
  }

  open(sealed: Uint8Array): Uint8Array {
    const nonce = sealed.slice(0, 12)
    const tag = sealed.slice(sealed.byteLength - 16)
    const encrypted = sealed.slice(12, sealed.byteLength - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce)
    decipher.setAuthTag(tag)
    return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]))
  }
}

class AssembledRouteStore implements RelayRouteStore {
  private readonly rows = new Map<string, {
    revision: number
    revoked: boolean
    owners: Map<string, { endpoint: 'mobile' | 'desktop'; pairingSelector?: RelayPairingSelector }>
  }>()

  async rotate(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array): Promise<number> {
    const current = this.rows.get(routeId)
    const revision = (current?.revision ?? 0) + 1
    const owners = new Map(current?.owners ?? [])
    for (const [encoded, owner] of owners) if (owner.endpoint === endpoint) owners.delete(encoded)
    owners.set(Buffer.from(digest).toString('hex'), { endpoint })
    this.rows.set(routeId, { revision, revoked: false, owners })
    return revision
  }

  async issue(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    digest: Uint8Array,
    pairingSelector?: RelayPairingSelector,
  ): Promise<number | undefined> {
    const current = this.rows.get(routeId)
    if (current === undefined || current.revoked) return undefined
    current.owners.set(Buffer.from(digest).toString('hex'), {
      endpoint, ...(pairingSelector === undefined ? {} : { pairingSelector }),
    })
    return current.revision
  }

  async registerPairing(
    routeId: RelayRouteId,
    pairingSelector: RelayPairingSelector,
    desktopDigest: Uint8Array,
    mobileDigest: Uint8Array,
  ): Promise<number> {
    const current = this.rows.get(routeId)
    const revision = current === undefined || current.revoked ? (current?.revision ?? 0) + 1 : current.revision
    const owners = current === undefined || current.revoked ? new Map() : new Map(current.owners)
    owners.set(Buffer.from(desktopDigest).toString('hex'), { endpoint: 'desktop', pairingSelector })
    owners.set(Buffer.from(mobileDigest).toString('hex'), { endpoint: 'mobile', pairingSelector })
    this.rows.set(routeId, { revision, revoked: false, owners })
    return revision
  }

  async authorize(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array) {
    const current = this.rows.get(routeId)
    const authority = current?.owners.get(Buffer.from(digest).toString('hex'))
    return current !== undefined && !current.revoked && authority?.endpoint === endpoint
      ? { revision: current.revision, ...(authority.pairingSelector === undefined
        ? {}
        : { pairingSelector: authority.pairingSelector }) }
      : undefined
  }

  async revokeCredential(routeId: RelayRouteId, endpoint: 'mobile' | 'desktop', digest: Uint8Array): Promise<number> {
    const current = this.rows.get(routeId)
    const revision = (current?.revision ?? 0) + 1
    const owners = new Map(current?.owners ?? [])
    const encoded = Buffer.from(digest).toString('hex')
    if (owners.get(encoded)?.endpoint === endpoint) owners.delete(encoded)
    this.rows.set(routeId, { revision, revoked: current?.revoked ?? true, owners })
    return revision
  }

  async revoke(routeId: RelayRouteId): Promise<number> {
    const revision = (this.rows.get(routeId)?.revision ?? 0) + 1
    this.rows.set(routeId, { revision, revoked: true, owners: new Map() })
    return revision
  }
}

class AssembledRedisBus {
  readonly published: string[] = []
  private readonly values = new Map<string, { value: string; expiresAt?: number }>()
  private readonly sets = new Map<string, Set<string>>()
  private readonly subscriptions = new Map<string, Set<(message: string) => void>>()

  client(): RelayRedisClient {
    const client: RelayRedisClient = {
      get: async key => this.read(key),
      sMembers: async key => [...(this.sets.get(key) ?? [])],
      set: async (key, value, options) => {
        this.write(key, value, options.PX)
        return 'OK'
      },
      eval: async (script, options) => {
        const key = options.keys[0]
        if (key === undefined) return 0
        if (script.includes("redis.call('SET', KEYS[1], ARGV[1]")) {
          this.write(key, options.arguments[0] as string, Number(options.arguments[1]))
          const routeKey = options.keys[1] as string
          const members = this.sets.get(routeKey) ?? new Set()
          members.add(options.arguments[2] as string)
          this.sets.set(routeKey, members)
          return 1
        }
        const value = this.read(key)
        if (value === null) return 0
        const record = JSON.parse(value) as { connectionToken?: string }
        if (record.connectionToken !== options.arguments[0]) return 0
        if (script.includes("redis.call('SREM'")) {
          this.values.delete(key)
          this.sets.get(options.keys[1] as string)?.delete(options.arguments[1] as string)
        } else {
          const replacement = options.arguments[1] as string
          const ttl = options.arguments[2]
          this.write(key, replacement, ttl === undefined ? undefined : Number(ttl))
          const routeKey = options.keys[1] as string
          const members = this.sets.get(routeKey) ?? new Set()
          members.add(options.arguments[3] as string)
          this.sets.set(routeKey, members)
        }
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
    for (const name of FORBIDDEN_REDIS_APIS) {
      Object.defineProperty(client, name, {
        value: () => {
          throw new Error(`Relay Redis mock forbids ${name}`)
        },
      })
    }
    return client
  }

  assertNoRetainedCiphertextFrames(): void {
    for (const record of this.values.values()) {
      if (record.expiresAt !== undefined && Date.now() >= record.expiresAt) continue
      assertNotCiphertextStoreValue(record.value)
    }
  }

  private read(key: string): string | null {
    const record = this.values.get(key)
    if (record === undefined) return null
    if (record.expiresAt !== undefined && Date.now() >= record.expiresAt) {
      this.values.delete(key)
      return null
    }
    return record.value
  }

  private write(key: string, value: string, ttlMs?: number): void {
    if (ttlMs !== undefined && (!Number.isSafeInteger(ttlMs) || ttlMs <= 0)) {
      throw new TypeError('Relay Redis mock PX must be a positive integer')
    }
    this.values.set(key, {
      value,
      ...(ttlMs === undefined ? {} : { expiresAt: Date.now() + ttlMs }),
    })
  }
}

function assertNotCiphertextStoreValue(value: string): void {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new Error('Relay Redis mock retained a non-JSON value')
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Relay Redis mock retained a non-object value')
  const record = parsed as Record<string, unknown>
  if (record.type === 'ciphertext' || typeof record.frame === 'string') {
    throw new Error('Relay Redis mock retained a ciphertext frame')
  }
}
