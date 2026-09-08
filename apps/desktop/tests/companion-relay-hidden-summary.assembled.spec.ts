/** Hidden Session summary projection through the production Desktop Relay owner. */

import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
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
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import { DesktopSnowRelayChannelOwner } from '../src/remote-relay.ts'
import {
  archiveDesktopHostSession, bootstrapDesktopHostCookie, createDesktopHostRpc,
  createDesktopHostSession, createDesktopHostSessionRequest, createDesktopHostWorkspace, promptDesktopHostSession,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import {
  generateDesktopHostTypertArtifacts,
  startShippedWebHost,
  stopShippedWebHosts,
} from './shipped-web-host.ts'
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
const uninstalls: Array<() => void | Promise<void>> = []
const cleanups: Array<() => void | Promise<void>> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  const errors: unknown[] = []
  for (const cleanup of [...uninstalls.splice(0), ...cleanups.splice(0)].reverse()) {
    try { await cleanup() } catch (error) { errors.push(error) }
  }
  try { await stopShippedWebHosts(children, homes) } catch (error) { errors.push(error) }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'hidden summary fixture teardown failed')
})

describe('assembled Desktop Relay hidden Session summary on shipped dsh web', () => {
  it('pushes an unobserved Session summary without clearing the observed conversation', async () => {
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
    const workspaceFrames: unknown[] = []
    const workspaceFollow = new AbortController()
    const watchingWorkspaces = rpc.followWorkspaces(workspaceFollow.signal, (frame) => { workspaceFrames.push(frame) })
    cleanups.push(async () => { workspaceFollow.abort(); await watchingWorkspaces })
    await expect.poll(() => workspaceFrames.some(frame => isRecord(frame) && frame.type === 'baseline')).toBe(true)
    const primaryPath = join(first.home, 'primary-workspace')
    await mkdir(primaryPath)
    const primaryWorkspaceId = workspaceIdFromCreate(await createDesktopHostWorkspace(rpc, primaryPath))
    const sessionId = parseCompanionSessionId('desktop-relay-live-session')
    await expect(createDesktopHostSessionRequest(rpc, {
      sessionId, workspaceId: primaryWorkspaceId,
    })).resolves.toMatchObject({ ok: true, value: { sessionId } })
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

    // Real attachment authentication: the Desktop attachment owner verifies
    // the Mobile IK transcript against the paired static state, and the Mobile
    // attachment owner produces that transcript from the Relay ready envelope —
    // exactly the production handshake with a memory-direct transport.
    const desktopAttachmentOwner = new SnowDesktopAttachmentOwner(selector =>
      selector === channels.pairingSelector ? channels.desktopReconnectState : undefined)
    const mobileAttachmentOwner = new SnowMobileAttachmentOwner(
      channels.mobileReconnectState, channels.pairingSelector)
    // The negotiated Mobile channel lives in a nullable slot: the lifecycle
    // cleanup registers before the handshake runs and releases the channel only
    // when the handshake got far enough to finish it.
    const negotiatedChannel: { mobile?: SnowCompanionProtocolChannel } = {}

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
      async (operation, selector, context) => operation.type === 'query-operation-status'
        ? await owner.queryOperationStatus(parsePersonalPairingId(selector), operation.operationId)
        : await owner.handle(operation, {
          ...pairingDependencies(owner, channels),
          generation: context.generation,
          desktopRevision: context.desktopRevision,
        }),
      () => 'Assembled Desktop',
      10_000,
      {
        connect: (selector, changed, disconnect) => owner.connectLiveProjection(
          parsePersonalPairingId(selector), changed, disconnect,
        ),
        project: async (change, _selector, signal) => await owner.projectLiveSession(
          change, channels.attachmentKey.slice(), signal,
        ),
        retainsConversation: (change, selector) => owner.retainsLiveConversation(
          parsePersonalPairingId(selector), change,
        ),
        reconnect: () => {},
      },
    )
    // One ordered lifecycle cleanup registered the moment the owners, queues,
    // and relay exist — before the handshake runs, so an accept or finish
    // failure still retires the relay projection, aborts and joins both queues
    // and the relay drain, disposes the Mobile attachment owner, frees the
    // negotiated channel only when the handshake finished it, and zeroes the
    // secrets last. Each stage collects its own error; the rest still run.
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
      await stage(() => { negotiatedChannel.mobile?.dispose() })
      await stage(() => {
        channels.attachmentKey.fill(0)
        channels.mobileReconnectState.fill(0)
        channels.desktopReconnectState.fill(0)
      })
      if (stageErrors.length === 1) throw stageErrors[0]
      if (stageErrors.length > 1) throw new AggregateError(stageErrors, 'live lifecycle teardown stages failed')
    })


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
    negotiatedChannel.mobile = mobileNegotiation.finish()
    connection.connect({
      channel: negotiatedChannel.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const receiver = new MobileNoiseCompanionReceiver(
      negotiatedChannel.mobile, channels.generation, runtime,
      () => ({ acceptValidatedCompanionResult: (result) => {
        product.acceptResult(result)
        surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
      } }),
      () => surface.bindAuthenticatedConnection(connectionChannel),
      (offset) => { surface.trackSurfaceRefresh(product.refreshSurface(offset)) },
    )
    receiverRef.current = receiver
    await scheduleInbound('handshake', mobileNegotiation.payload)


    const observedId = SessionId(sessionId)
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(observedId), { timeout: 90_000 }).toBe(true)
    await expect(promptDesktopHostSession(rpc, {
      requestId: 'desktop-observed-summary-baseline', sessionId, mode: 'queue',
      content: [{ type: 'text', text: 'persist the observed conversation baseline' }],
    })).resolves.toMatchObject({ ok: true, value: { accepted: true } })
    surface.observeSession(observedId)
    await expect.poll(() => observedConversationEvidence(surface, observedId)).toEqual([
      { kind: 'user', text: 'persist the observed conversation baseline' },
      { kind: 'assistant', text: 'observed-stable-answer' },
    ])
    const observedNodes = observedConversationEvidence(surface, observedId)

    const hiddenId = parseCompanionSessionId('desktop-relay-hidden-summary-session')
    const hiddenLocalId = SessionId(hiddenId)
    await expect(createDesktopHostSession(rpc, hiddenId)).resolves.toMatchObject({
      ok: true, value: { sessionId: hiddenId },
    })
    await expect(promptDesktopHostSession(rpc, {
      requestId: 'desktop-hidden-summary-prompt', sessionId: hiddenId, mode: 'queue',
      content: [{ type: 'text', text: 'complete an unobserved hidden summary' }],
    })).resolves.toMatchObject({ ok: true, value: { accepted: true } })
    await expect.poll(() => {
      const row = surface.getSnapshot().sessions.byId[hiddenLocalId]
      return row !== undefined &&  row.running
    }, { timeout: 60_000 }).toBe(true)
    llm.release()
    await expect.poll(() => {
      const row = surface.getSnapshot().sessions.byId[hiddenLocalId]
      return row !== undefined && ! row.running && ! row.blank
    }, { timeout: 60_000 }).toBe(true)
    expect(surface.getSnapshot().conversations[hiddenLocalId]).toBeUndefined()
    expect(observedConversationEvidence(surface, observedId)).toEqual(observedNodes)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()

    const secondaryPath = join(first.home, 'secondary-workspace')
    await mkdir(secondaryPath)
    const secondaryCreated = await createDesktopHostWorkspace(rpc, secondaryPath)
    const secondaryWorkspaceId = workspaceIdFromCreate(secondaryCreated)
    const secondarySessionId = parseCompanionSessionId('desktop-secondary-workspace-session')
    await expect(createDesktopHostSessionRequest(rpc, {
      sessionId: secondarySessionId, workspaceId: secondaryWorkspaceId,
    })).resolves.toMatchObject({ ok: true })
    await expect.poll(() => latestWorkspaceOrder(workspaceFrames)).toEqual([
      secondaryWorkspaceId, primaryWorkspaceId,
    ])
    const initialWorkspaceOrder = latestWorkspaceOrder(workspaceFrames)
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual(initialWorkspaceOrder)
    const [move, before] = initialWorkspaceOrder
    if (move === undefined || before === undefined) throw new Error('Host Workspace order did not contain both rows')
    await expect(workspaceMutation(rpc, 'workspace/insertBefore', {
      workspaceId: before, beforeWorkspaceId: move,
    })).resolves.toMatchObject({ ok: true })
    await expect.poll(() => latestWorkspaceOrder(workspaceFrames)).toEqual([before, move])
    expect(latestWorkspaceOrder(workspaceFrames)).not.toEqual(initialWorkspaceOrder)
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual(latestWorkspaceOrder(workspaceFrames))
    await expect(workspaceMutation(rpc, 'workspace/delete', {
      workspaceId: secondaryWorkspaceId,
    })).resolves.toMatchObject({ ok: true })
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual([primaryWorkspaceId])
    await expect(archiveDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true })
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(observedId)).toBe(false)
    expect(surface.getSnapshot().conversations[observedId]).toBeUndefined()
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    await drainTransport()
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
  let requestCount = 0
  const server: Server = createServer((request, response) => {
    request.on('data', () => {})
    request.on('end', () => {
      if (request.headers.authorization !== `Bearer ${apiKey}`) {
        response.writeHead(401).end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      requestCount += 1
      const send = (payload: unknown): void => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`)
      }
      send({ choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
      if (requestCount === 1) {
        send({ choices: [{ index: 0, delta: { content: 'observed-stable-answer' }, finish_reason: null }] })
        send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
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
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
  }
}

function latestWorkspaceOrder(frames: readonly unknown[]): string[] {
  let order: string[] = []
  for (const frame of frames) {
    if (!isRecord(frame)) continue
    if (frame.type === 'baseline' && isRecord(frame.value) && Array.isArray(frame.value.items)) {
      order = frame.value.items.flatMap(item => isRecord(item) && typeof item.workspaceId === 'string'
        ? [item.workspaceId]
        : [])
    } else if (frame.type === 'order' && Array.isArray(frame.workspaceIds)
      && frame.workspaceIds.every(id => typeof id === 'string')) {
      order = [...frame.workspaceIds]
    }
  }
  return order
}

function workspaceIdFromCreate(result: Awaited<ReturnType<typeof createDesktopHostWorkspace>>): string {
  if (!result.ok || !isRecord(result.value) || !isRecord(result.value.workspace)
    || typeof result.value.workspace.workspaceId !== 'string') {
    throw new Error(`Workspace create failed: ${JSON.stringify(result)}`)
  }
  return result.value.workspace.workspaceId
}

async function workspaceMutation(
  rpc: ReturnType<typeof createDesktopHostRpc>,
  method: 'workspace/delete' | 'workspace/insertBefore',
  request: Record<string, string>,
) {
  return await rpc.call(method, { args: { request } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function observedConversationEvidence(
  surface: MobileCompanionSurface,
  sessionId: SessionId,
): Array<{ kind: string; text: string }> {
  const nodes = surface.getSnapshot().conversations[sessionId]?.nodes ?? []
  const evidence: Array<{ kind: string; text: string }> = []
  for (const node of nodes) {
    if (!isRecord(node)) continue
    if (node.kind === 'user' && Array.isArray(node.content)) {
      const text: unknown = node.content.find(block => isRecord(block) && block.type === 'text')
      if (isRecord(text) && typeof text.text === 'string') evidence.push({ kind: 'user', text: text.text })
    } else if (node.kind === 'assistant' && Array.isArray(node.blocks)) {
      const text: unknown = node.blocks.find(block => isRecord(block) && block.kind === 'text')
      if (isRecord(text) && typeof text.text === 'string') evidence.push({ kind: 'assistant', text: text.text })
    }
  }
  return evidence
}

function pairingDependencies(
  owner: InstanceType<typeof DesktopCompanionProductOwner>,
  channels: Awaited<ReturnType<typeof snowProductChannels>>,
): Parameters<InstanceType<typeof DesktopCompanionProductOwner>['handle']>[1] {
  const attachmentKey = channels.attachmentKey.slice()
  return {
    pairingId: parsePersonalPairingId(channels.pairingSelector),
    attachmentKey,
    now: Date.now,
    generation: channels.generation,
    desktopRevision: 0,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('live must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('live must not submit an attachment')),
    resolveInteraction: interactionId => owner.resolveInteraction(interactionId, attachmentKey),
    pendingInteractions: sessionId => owner.pendingInteractions(sessionId, attachmentKey),
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
