/** Live Session projection through the production Desktop Relay owner to the Mobile surface. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob, readFile } from 'node:fs/promises'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseCompanionSessionId,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  initializeSnowChannel,
  SnowDesktopAttachmentOwner, SnowDesktopEndpointPairingOwner, SnowMobileAttachmentOwner, SnowMobileHandshakeClient,
} from '@deepseek-ai/dsh-noise-channel'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { decompressZstdFrame, scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import { DesktopSnowRelayChannelOwner } from '../src/remote-relay.ts'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import {
  generateDesktopHostTypertArtifacts,
  startShippedWebHost,
  stopShippedWebHosts,
} from './shipped-web-host.ts'
import { runTeardown } from './teardown-collector.ts'
import { CompanionForegroundRuntime } from '../../mobile/src/companion-lifecycle.ts'
import {
  CompanionUncertainOperationSettlement,
  InMemoryCompanionCacheStore,
  parseCompanionDesktopId,
} from '../../mobile/src/companion-cache.ts'
import { MobileCompanionSurface } from '../../mobile/src/companion-surface.ts'
import {
  MobileSnowCompanionConnection, MobileSnowCompanionProductChannel,
} from '../../mobile/src/noise-companion-product.ts'
import { MobileNoiseCompanionReceiver } from '../../mobile/src/noise-companion.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
const cleanups: Array<() => Promise<void>> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

// Splice both registries empty (a repeated suite run must not reuse old
// disposers) and order the merged list so the reversed drain runs cleanups —
// cancel, settle, dispose, key-zeroing — before the Host uninstalls.
afterEach(() => runTeardown([...uninstalls.splice(0), ...cleanups.splice(0)], () => stopShippedWebHosts(children, homes)))

describe('assembled Desktop Relay live Session projection on shipped dsh web', () => {
  it('delivers a real Host turn live without a manual history pull', async () => {
    const apiKey = 'desktop-assembled-relay-live-key'
    const llm = await startControlledStreamingLlm(apiKey)
    cleanups.push(async () => { await llm.close() })
    const first = await startShippedWebHost({
      children, homes,
      env: { DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: llm.baseUrl },
      extraPatches: [join(import.meta.dirname, 'fixtures/snow-question-no-title.patch.yml')],
    })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId('desktop-relay-live-session')
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-relay-live-operations.json')),
    ))
    uninstalls.push(owner.installHost(first.running.url, cookie))
    const channels = await snowProductChannels()
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    const surface = new MobileCompanionSurface(runtime)
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}

    // Production Desktop Relay owner over a memory-direct transport: the Relay
    // WebSocket is the acceptOwner/sender abstraction seam, so the assembled
    // test substitutes only the transport while queueing, epochs, revision
    // allocation, surface replays, and retains guards run in production code.
    const transportErrors: unknown[] = []
    const ik2Waiters: Array<{ resolve: (frame: Uint8Array) => void }> = []
    const nextTransportFrame = (): Promise<Uint8Array> => new Promise((resolve) => {
      ik2Waiters.push({ resolve })
    })
    // Desktop→Mobile delivery queue: like a WebSocket send, enqueueing never
    // awaits the peer's business processing. One ordered pump task drains the
    // queue; its failures are collected so the test fails on transport errors,
    // and teardown awaits it before disposing the channel pair.
    const desktopToMobile: Uint8Array[] = []
    let deliveryPump: Promise<void> | undefined
    const drainDelivery = (): Promise<void> => deliveryPump === undefined
      ? Promise.resolve()
      : deliveryPump.then(() => drainDelivery())
    const relaySend = async (
      _selector: ReturnType<typeof parseRelayPairingSelector>,
      _target: ReturnType<typeof parseRelayAttachmentId>,
      ciphertext: Uint8Array,
    ): Promise<void> => {
      const waiter = ik2Waiters.shift()
      if (waiter !== undefined) {
        waiter.resolve(ciphertext.slice())
        return
      }
      desktopToMobile.push(ciphertext.slice())
      if (deliveryPump !== undefined) return
      const claimDelivery = (): void => {
        deliveryPump = Promise.resolve().then(async () => {
          for (;;) {
            const frame = desktopToMobile.shift()
            if (frame === undefined) return
            const receiver = receiverRef.current
            // Frames that arrive before the Mobile transport attaches stay queued;
            // the pump retries once the receiver installs.
            if (receiver === undefined) {
              desktopToMobile.unshift(frame)
              await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
              continue
            }
            receiver.receive(frame)
          }
        })
        void deliveryPump.then(() => {
          deliveryPump = undefined
          if (desktopToMobile.length > 0) claimDelivery()
        }, (error: unknown) => {
          deliveryPump = undefined
          transportErrors.push(new Error('[delivery desktop→mobile] pump failed', { cause: error }))
        })
      }
      claimDelivery()
    }
    // Real attachment authentication: the Desktop attachment owner verifies
    // the Mobile IK transcript against the paired static state, and the Mobile
    // attachment owner produces that transcript from the Relay ready envelope —
    // exactly the production handshake with a memory-direct transport.
    const desktopAttachmentOwner = new SnowDesktopAttachmentOwner(selector =>
      selector === channels.pairingSelector ? channels.desktopReconnectState : undefined)
    const mobileAttachmentOwner = new SnowMobileAttachmentOwner(
      channels.mobileReconnectState, channels.pairingSelector)
    const begun = await mobileAttachmentOwner.begin({
      type: 'ready', transportVersion: 1, routeId: parseRelayRouteId('route-assembled-relay-live'),
      attachmentId: channels.mobileAttachmentId,
      peers: [{
        attachmentId: channels.desktopAttachmentId,
        pairingSelector: channels.pairingSelector, generation: channels.generation,
      }],
    })
    const relayOwner = new DesktopSnowRelayChannelOwner(
      desktopAttachmentOwner,
      relaySend,
      async (operation, _selector, context) => await owner.handle(operation, {
        ...pairingDependencies(channels),
        generation: context.generation,
        desktopRevision: context.desktopRevision,
      }),
      () => 'Assembled Desktop',
      10_000,
      {
        connect: (selector, changed, disconnect) => owner.connectLiveProjection(
          parsePersonalPairingId(selector), changed, disconnect,
        ),
        project: async (change, selector, signal) => await owner.projectLiveSession(
          change, channels.attachmentKey.slice(), signal,
        ),
        retainsConversation: (change, selector) => owner.retainsLiveConversation(
          parsePersonalPairingId(selector), change,
        ),
        reconnect: () => {},
      },
    )
    const drainTransport = async (): Promise<void> => {
      inboundAbort.abort()
      await Promise.all([drainDelivery(), drainInbound()])
      if (transportErrors.length > 0) {
        const first = transportErrors[0]
        throw first instanceof Error
          ? new Error(`memory-direct transport failed: ${first.message}`, { cause: first })
          : new Error(`memory-direct transport failed: ${String(first)}`)
      }
    }
    relayOwner.updatePeers({
      type: 'ready', transportVersion: 1, routeId: parseRelayRouteId('route-assembled-relay-live'),
      attachmentId: channels.desktopAttachmentId,
      peers: [{
        attachmentId: channels.mobileAttachmentId,
        pairingSelector: channels.pairingSelector, generation: channels.generation,
      }],
    }, channels.pairingSelector)

    // ONE FIFO scheduler for every Mobile→Desktop relay receive (IK1, IK3, and
    // application frames). Admit and completion are separate contracts: an
    // application send resolves as soon as its frame is queued (WebSocket
    // client semantics), while handshake steps await the receive outcome. The
    // drain task is claimed synchronously and only starts draining on a
    // microtask, so a receive() that synchronously re-enters scheduleInbound
    // always observes the claimed owner instead of racing a second pump.
    interface InboundEntry {
      readonly frame: Uint8Array
      readonly kind: string
      readonly seq: number
      settle: (outcome: 'ok' | { fail: Error }) => void
    }
    const inboundQueue: InboundEntry[] = []
    let inboundTask: Promise<void> | undefined
    const inboundAbort = new AbortController()
    const inboundSignal = inboundAbort.signal
    let inboundSeq = 0
    const scheduleInbound = (kind: 'handshake' | 'application', frame: Uint8Array): Promise<void> => {
      const seq = ++inboundSeq
      const queued = new Promise<void>((resolve, reject) => {
        inboundQueue.push({
          frame: frame.slice(), kind, seq,
          settle: (outcome) => {
            if (outcome === 'ok') {
              resolve()
            } else {
              reject(outcome.fail)
            }
          },
        })
      })
      queued.catch(() => {})
      if (inboundTask === undefined) {
        const claimDrain = (): void => {
          inboundTask = Promise.resolve().then(async () => {
            for (;;) {
              const entry = inboundQueue.shift()
              if (entry === undefined) return
              try {
                await relayOwner.receive(
                  entry.frame, channels.mobileAttachmentId, channels.desktopAttachmentId,
                  channels.pairingSelector, inboundSignal,
                )
                entry.settle('ok')
              } catch (error) {
                entry.settle({ fail: error instanceof Error ? error : new Error(String(error)) })
                throw error
              }
            }
          })
          void inboundTask.then(() => {
            inboundTask = undefined
            // A frame enqueued between the drain task settling and this
            // cleanup microtask saw a non-undefined claim and skipped starting
            // a pump; restart the drain for whatever is still queued.
            if (inboundQueue.length > 0) claimDrain()
          }, (error: unknown) => {
            inboundTask = undefined
            transportErrors.push(new Error('[inbound mobile→desktop] receive failed', { cause: error }))
            for (const entry of inboundQueue.splice(0)) entry.settle({ fail: new Error('inbound scheduler stopped') })
          })
        }
        claimDrain()
      }
      return kind === 'application' ? Promise.resolve() : queued
    }
    const drainInbound = (): Promise<void> => inboundTask === undefined
      ? Promise.resolve()
      : inboundTask.then(() => drainInbound())
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-relay-live'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
      trackHistoryRefresh: (id, submission) => { surface.trackHistoryRefresh(id, submission) },
      sendCiphertext: async (_target, ciphertext) => {
        await scheduleInbound('application', ciphertext)
      },
    })
    const connectionChannel = {
      mutations: product,
      content: { loadImage: async (id: never, attachment: never) => await product.loadImage(id, attachment) },
    }

    // Drive the real IK transcript over the memory-direct transport: message 1
    // authenticates through the Desktop attachment owner, the response finishes
    // the Mobile negotiation, and the relay owner publishes the channel.
    const ik2Frame = nextTransportFrame()
    await scheduleInbound('handshake', begun.payload)
    const mobileNegotiation = mobileAttachmentOwner.finish(
      await ik2Frame, channels.desktopAttachmentId,
    )
    const mobileChannel = mobileNegotiation.finish()
    // One ordered lifecycle cleanup registered once every resource exists:
    // retire the relay projection first, settle ALL transport and relay work
    // (allSettled — one rejecting drain never skips the other or the relay
    // drain), dispose the Mobile attachment owner, then zero the secrets last
    // so nothing in flight observes wiped bytes. Each stage collects its own
    // error and the remaining stages still run.
    cleanups.push(async () => {
      const stageErrors: unknown[] = []
      const stage = async (run: () => void | Promise<void>): Promise<void> => {
        try { await run() } catch (error) { stageErrors.push(error instanceof Error ? error : new Error(String(error))) }
      }
      await stage(() => { relayOwner.invalidate(channels.pairingSelector) })
      await stage(async () => {
        inboundAbort.abort()
        const settled = await Promise.allSettled([drainDelivery(), drainInbound(), relayOwner.drain()])
        for (const outcome of settled) {
          if (outcome.status === 'rejected') stageErrors.push(outcome.reason)
        }
        if (transportErrors.length > 0) {
          const first = transportErrors[0]
          stageErrors.push(first instanceof Error
            ? new Error(`memory-direct transport failed: ${first.message}`, { cause: first })
            : new Error(`memory-direct transport failed: ${String(first)}`))
        }
      })
      await stage(() => { mobileAttachmentOwner.dispose() })
      await stage(() => {
        channels.attachmentKey.fill(0)
        channels.mobileReconnectState.fill(0)
        channels.desktopReconnectState.fill(0)
      })
      if (stageErrors.length === 1) throw stageErrors[0]
      if (stageErrors.length > 1) throw new AggregateError(stageErrors, 'live lifecycle teardown stages failed')
    })
    connection.connect({
      channel: mobileChannel, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const receiver = new MobileNoiseCompanionReceiver(
      mobileChannel, channels.generation, runtime,
      () => ({ acceptValidatedCompanionResult: (result) => {
        product.acceptResult(result)
        surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
      } }),
      () => surface.bindAuthenticatedConnection(connectionChannel),
      (offset) => { surface.trackSurfaceRefresh(product.refreshSurface(offset)) },
    )
    receiverRef.current = receiver
    await scheduleInbound('handshake', mobileNegotiation.payload)


    const localSessionId = sessionId as SessionId

    await expect.poll(() => {
      if (transportErrors.length > 0) {
        const first = transportErrors[0]
        if (first instanceof Error) {
          first.message = `[transport] ${first.message}`
          throw first
        }
        throw new Error(String(first))
      }
      return surface.getSnapshot().sessions.ids.includes(localSessionId)
    }, { timeout: 90_000 }).toBe(true)
    surface.observeSession(localSessionId)
    await expect.poll(() => surface.getSnapshot().sessions.byId[localSessionId] !== undefined, { timeout: 30_000 }).toBe(true)
    await expect(surface.submit(localSessionId, 'project this turn live')).resolves.toBeUndefined()
    // Stage 1 — while the model stream is held mid-answer, the submitted user
    // message and the running turn must already be live on the surface.
    await expect.poll(() => {
      const conversation = surface.getSnapshot().conversations[localSessionId]
      if (conversation === undefined) return false
      const userNode = conversation.nodes.some(node => isRecord(node) && node.kind === 'user')
      return conversation.running === true && userNode
    }, { timeout: 60_000 }).toBe(true)
    // Stage 2 — after the model finishes, the final assistant node and the
    // stopped turn arrive as further live replacements without any history pull.
    llm.release()
    await expect.poll(() => {
      const conversation = surface.getSnapshot().conversations[localSessionId]
      if (conversation === undefined) return false
      const assistantNode = conversation.nodes.some(node => isRecord(node)
        && node.kind === 'assistant'
        && Array.isArray(node.blocks)
        && node.blocks.some(block => isRecord(block) && block.kind === 'text' && block.text === 'live-projected-answer'))
      return conversation.running === false && assistantNode
    }, { timeout: 60_000 }).toBe(true)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    await drainTransport()
    const log = await durableSessionLog(first.home, sessionId)
    expect(log).toContain('live-projected-answer')
    expect(log).toContain('"type":"turn/end"')

    // Retire the relay projection through the production path, drain its
    // queues, then keep the OBSERVED Session itself producing Host turns: the
    // surface must not receive any further live delivery.
    relayOwner.invalidate(channels.pairingSelector)
    await relayOwner.drain()
    const nodesBeforeDisconnect = surface.getSnapshot().conversations[localSessionId]?.nodes.length ?? 0
    const turnsBeforeDisconnect = await countTurnEnds(first.home, sessionId)
    await expect(owner.handle({
      type: 'submit-prompt', operationId: 'relay-live-after-disconnect' as never,
      sessionId, text: 'the observed Session continues without its projection stream',
    }, pairingDependencies(channels))).resolves.toMatchObject({ type: 'confirmed' })
    await expect.poll(async () => await countTurnEnds(first.home, sessionId) > turnsBeforeDisconnect).toBe(true)
    expect(surface.getSnapshot().conversations[localSessionId]?.nodes.length).toBe(nodesBeforeDisconnect)
  }, 180_000)
})


/**
 * External streaming model fixture with a deterministic mid-answer barrier:
 * the first half of the answer is streamed, the response is held until
 * `release()`, then the remainder and the terminal chunk complete the turn.
 */
async function startControlledStreamingLlm(apiKey: string): Promise<{
  readonly release: () => void
  readonly baseUrl: string
  readonly close: () => Promise<void>
}> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  const server: Server = createServer((request, response) => {
    request.on('data', () => {})
    request.on('end', () => {
      if (request.headers.authorization !== `Bearer ${apiKey}`) {
        response.writeHead(401).end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (payload: unknown): void => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`)
      }
      send({ choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
      send({ choices: [{ index: 0, delta: { content: 'live-projected-' }, finish_reason: null }] })
      void held.then(() => {
        send({ choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] })
        send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
        response.write('data: [DONE]\n\n')
        response.end()
      })
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('controlled streaming fixture has no port')
  return {
    release,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()) }),
  }
}

function pairingDependencies(channels: Awaited<ReturnType<typeof snowProductChannels>>): {
  pairingId: ReturnType<typeof parsePersonalPairingId>
  attachmentKey: Uint8Array
  now: () => number
  generation: number
  desktopRevision: number
  desktopName: string
  downloadAttachment: () => Promise<never>
  submitAttachment: () => Promise<never>
} {
  return {
    pairingId: parsePersonalPairingId(channels.pairingSelector),
    attachmentKey: channels.attachmentKey.slice(),
    now: Date.now,
    generation: channels.generation,
    desktopRevision: 0,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('live must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('live must not submit an attachment')),
  }
}

function connectedRuntime(): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure({
    routeId: parseRelayRouteId('route-assembled-relay-live'), endpoint: 'mobile',
    credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never, revision: 1,
  })
  runtime.markConnectionOpen()
  return runtime
}

async function snowProductChannels(): Promise<{
  mobileReconnectState: Uint8Array
  desktopReconnectState: Uint8Array
  attachmentKey: Uint8Array
  pairingSelector: ReturnType<typeof parseRelayPairingSelector>
  desktopAttachmentId: ReturnType<typeof parseRelayAttachmentId>
  mobileAttachmentId: ReturnType<typeof parseRelayAttachmentId>
  generation: number
}> {
  initializeSnowChannel(readFileSync(new URL(
    '../../../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm', import.meta.url,
  )))
  const desktopPairing = new SnowDesktopEndpointPairingOwner()
  const invitation = await desktopPairing.createInvitation(Date.now() + 60_000)
  const mobilePairing = new SnowMobileHandshakeClient()
  const message1 = await mobilePairing.beginEndpointInvitation(invitation.invitationPayload)
  const message2 = await desktopPairing.acceptMessage1(message1)
  await mobilePairing.acceptDesktopHandshake(message2)
  const message3 = mobilePairing.exportFinishMessage()
  await desktopPairing.finishMessage3(message3)
  const attachmentKey = new Uint8Array(32).fill(43)
  const pairingSelector = parseRelayPairingSelector('pairing-assembled-relay-live')
  const grant = {
    routeId: parseRelayRouteId('route-assembled-relay-live'), endpoint: 'mobile' as const,
    credential: await generateRelayCredential(), revision: 1, pairingSelector,
  }
  const sealedGrant = await desktopPairing.sealMobileRelayAuthority(grant, attachmentKey)
  await mobilePairing.openRelayAuthority(sealedGrant)
  const desktopAttachmentId = parseRelayAttachmentId('desktop-assembled-relay-live')
  const mobileAttachmentId = parseRelayAttachmentId('mobile-assembled-relay-live')
  const generation = 1
  return {
    mobileReconnectState: mobilePairing.exportReconnectState(),
    desktopReconnectState: desktopPairing.exportReconnectState(),
    attachmentKey, pairingSelector, desktopAttachmentId, mobileAttachmentId, generation,
  }
}

function assembledOperationSettlement(desktopId: string): CompanionUncertainOperationSettlement {
  return new CompanionUncertainOperationSettlement(
    new InMemoryCompanionCacheStore(),
    parseCompanionDesktopId(desktopId),
  )
}

async function durableSessionLog(home: string, sessionId: string): Promise<string> {
  const root = join(home, '.dsh', 'sessions')
  const matches: string[] = []
  for await (const match of glob(`**/${sessionId}/session.jsonl.zstd`, { cwd: root })) {
    matches.push(match)
  }
  if (matches[0] === undefined) return ''
  const bytes = await readFile(join(root, matches[0]))
  const scan = scanZstdFrames(bytes)
  const chunks: Buffer[] = []
  for (const frame of scan.frames) {
    chunks.push(await decompressZstdFrame(bytes.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function countTurnEnds(home: string, sessionId: string): Promise<number> {
  const log = await durableSessionLog(home, sessionId)
  return (log.match(/"type":"turn\/end"/g) ?? []).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
