/** Live Session projection through Snow to the Mobile surface without manual history pulls. */

import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob, readFile } from 'node:fs/promises'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionProjection,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { decompressZstdFrame, scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import type { DesktopCompanionLiveProjectionChange } from '../src/companion-live-projection.ts'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession,
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
const uninstalls: Array<() => void> = []
const cleanups: Array<() => Promise<void>> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
  } finally {
    await stopShippedWebHosts(children, homes)
  }
})

describe('assembled Desktop Companion live Session projection on shipped dsh web', () => {
  it('delivers a real Host turn to the Mobile surface without a manual history pull', async () => {
    const apiKey = 'desktop-assembled-snow-live-key'
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
    const sessionId = parseCompanionSessionId('desktop-snow-live-session')
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-live-operations.json')),
    ))
    uninstalls.push(owner.installHost(first.running.url, cookie))
    const channels = await snowProductChannels()
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const surface = new MobileCompanionSurface(runtime)
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    // One authoritative desktop-revision counter for this bridge, mirroring the
    // Desktop Relay owner: operations observe its current value, and every
    // sealed projection is stamped by the same monotonic allocation.
    let desktopRevision = 1
    const allocateDesktopRevision = (): number => desktopRevision += 1
    const observedChange: { current?: DesktopCompanionLiveProjectionChange } = {}
    const liveErrors: unknown[] = []
    const pendingLive = new Map<string, DesktopCompanionLiveProjectionChange>()
    let livePump: Promise<void> | undefined
    const liveTasks = new Set<Promise<void>>()
    const drainLive = (): Promise<void> => livePump === undefined
      ? Promise.resolve()
      : livePump.then(() => drainLive())
    const projectChange = async (change: DesktopCompanionLiveProjectionChange): Promise<void> => {
      const receiver = receiverRef.current
      // Before the Mobile receiver installs, no authenticated channel exists;
      // the Desktop Relay owner drops these projections the same way.
      if (receiver === undefined) return
      if (change.type === 'surface') {
        // Surface authority changes replay the foreground-sync baseline exactly
        // as the Desktop Relay owner's pumpLive does before the Mobile surface
        // refreshes itself.
        receiver.receive(channels.desktop.seal({ type: 'projection', projection: {
          type: 'foreground-sync', desktopName: 'Assembled Desktop',
          generation: channels.generation, desktopRevision: allocateDesktopRevision(),
        } }))
        return
      }
      const payload = await owner.projectLiveSession(change, channels.attachmentKey.slice(), new AbortController().signal)
      const projection: CompanionProjection = {
        type: 'session-live', generation: channels.generation,
        desktopRevision: allocateDesktopRevision(),
        ...payload,
      } as CompanionProjection
      receiver.receive(channels.desktop.seal({ type: 'projection', projection: requireEncodableProjection(channels.desktop, projection) }))
    }
    const pumpLive = async (): Promise<void> => {
      for (;;) {
        const next = pendingLive.entries().next()
        if (next.done) return
        const [key, change] = next.value
        pendingLive.delete(key)
        await projectChange(change)
      }
    }
    const queueLive = (change: DesktopCompanionLiveProjectionChange): void => {
      observedChange.current = change
      const key = change.type === 'surface' ? 'surface' : change.sessionId
      if (change.type === 'surface') pendingLive.clear()
      pendingLive.set(key, change)
      if (livePump !== undefined) return
      const pump = pumpLive()
      livePump = pump
      liveTasks.add(pump)
      void pump.then(() => {
        if (livePump === pump) livePump = undefined
        liveTasks.delete(pump)
      }, (error) => {
        if (livePump === pump) livePump = undefined
        liveTasks.delete(pump)
        liveErrors.push(error)
      })
    }
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-snow-live'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
      trackHistoryRefresh: (id, submission) => { surface.trackHistoryRefresh(id, submission) },
      sendCiphertext: async (_target, ciphertext) => {
        await Promise.resolve()
        const opened = channels.desktop.open(ciphertext)
        if (opened.type !== 'operation') throw new Error('assembled Desktop expected a Companion operation')
        const output = opened.operation.type === 'query-operation-status'
          ? await owner.queryOperationStatus(parsePersonalPairingId(channels.pairingSelector), opened.operation.operationId)
          : await owner.handle(opened.operation, pairingDependencies(owner, channels, desktopRevision))
        const receiver = receiverRef.current
        if (receiver === undefined) throw new Error('assembled Mobile receiver is not installed')
        for (const item of isResultList(output) ? output : [output]) {
          const projection = isProjection(item)
            ? { ...item, generation: channels.generation, desktopRevision: allocateDesktopRevision() } as CompanionProjection
            : undefined
          if (projection === undefined) {
            if (isProjection(item)) throw new Error('assembled projection classification changed while sealing')
            receiver.receive(channels.desktop.seal({ type: 'result', result: item }))
          } else {
            receiver.receive(channels.desktop.seal({ type: 'projection', projection }))
          }
        }
      },
    })
    const connectionChannel = {
      mutations: product,
      content: { loadImage: async (id: never, attachment: never) => await product.loadImage(id, attachment) },
    }
    const receiver = new MobileNoiseCompanionReceiver(
      channels.mobile, channels.generation, runtime,
      () => ({ acceptValidatedCompanionResult: (result) => {
        product.acceptResult(result)
        surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
      } }),
      () => surface.bindAuthenticatedConnection(connectionChannel),
      (offset) => { surface.trackSurfaceRefresh(product.refreshSurface(offset)) },
    )
    receiverRef.current = receiver
    const disposeLive = owner.connectLiveProjection(
      parsePersonalPairingId(channels.pairingSelector),
      queueLive,
      (error) => { liveErrors.push(error) },
    )
    uninstalls.push(disposeLive)
    receiver.receive(channels.desktop.seal({
      type: 'projection',
      projection: {
        type: 'foreground-sync', desktopName: 'Assembled Desktop',
        generation: channels.generation, desktopRevision: 1,
      },
    }))
    const localSessionId = SessionId(sessionId)
    await expect.poll(() => {
      return surface.getSnapshot().sessions.ids.includes(localSessionId)
    }).toBe(true)
    surface.observeSession(localSessionId)
    await expect.poll(() => observedChange.current?.type === 'session'
      && observedChange.current.sessionId === sessionId
      && observedChange.current.includeConversation === true).toBe(true)
    await expect.poll(() => surface.getSnapshot().sessions.byId[localSessionId] !== undefined).toBe(true)
    await expect(surface.submit(localSessionId, 'project this turn live')).resolves.toBeUndefined()
    // Stage 1 — while the model stream is held mid-answer, the submitted user
    // message and the running turn must already be live on the surface.
    await expect.poll(() => {
      if (liveErrors.length > 0) throw new Error(`live projection failed: ${String(liveErrors[0])}`)
      const conversation = surface.getSnapshot().conversations[localSessionId]
      if (conversation === undefined) return false
      const userNode = conversation.nodes.some(node => isRecord(node) && node.kind === 'user')
      return conversation.running === true && userNode
    }, { timeout: 60_000 }).toBe(true)
    // Stage 2 — after the model finishes, the final assistant node and the
    // stopped turn arrive as further live replacements without any history pull.
    llm.release()
    await expect.poll(() => {
      if (liveErrors.length > 0) throw new Error(`live projection failed: ${String(liveErrors[0])}`)
      const conversation = surface.getSnapshot().conversations[localSessionId]
      if (conversation === undefined) return false
      const assistantNode = conversation.nodes.some(node => isRecord(node)
        && node.kind === 'assistant'
        && Array.isArray(node.blocks)
        && node.blocks.some(block => isRecord(block) && block.kind === 'text' && block.text === 'live-projected-answer'))
      return conversation.running === false && assistantNode
    }, { timeout: 60_000 }).toBe(true)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    const log = await durableSessionLog(first.home, sessionId)
    expect(log).toContain('live-projected-answer')
    expect(log).toContain('"type":"turn/end"')
    disposeLive()
    await drainLive()
    if (liveErrors.length > 0) throw new Error(`live projection failed before disconnect: ${String(liveErrors[0])}`)
    const nodesBeforeDisconnect = surface.getSnapshot().conversations[localSessionId]?.nodes.length ?? 0
    const turnsBeforeDisconnect = await countTurnEnds(first.home, sessionId)
    const second = parseCompanionSessionId('desktop-snow-live-after-disconnect')
    await expect(createDesktopHostSession(rpc, second)).resolves.toMatchObject({ ok: true })
    await expect(owner.handle({
      type: 'submit-prompt', operationId: parseCompanionOperationId('live-after-disconnect-prompt'),
      sessionId: second, text: 'host continues without the projected connection',
    }, pairingDependencies(owner, channels, desktopRevision))).resolves.toMatchObject({ type: 'confirmed' })
    await expect.poll(() => durableSessionLog(first.home, second).then(text => text.includes('turn/end'))).toBe(true)
    await expect(owner.handle({
      type: 'submit-prompt', operationId: parseCompanionOperationId('live-observed-after-disconnect-prompt'),
      sessionId, text: 'the observed Session continues without its projection stream',
    }, pairingDependencies(owner, channels, desktopRevision))).resolves.toMatchObject({ type: 'confirmed' })
    await expect.poll(async () => await countTurnEnds(first.home, sessionId) > turnsBeforeDisconnect).toBe(true)
    expect(liveTasks.size).toBe(0)
    expect(surface.getSnapshot().sessions.ids).not.toContain(SessionId(second))
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

/**
 * The direct bridge refuses any projection the channel cannot encode. The
 * Desktop Relay owner (boundLiveSessionProjection in
 * apps/desktop/src/remote-relay.ts) degrades oversized conversations instead;
 * that path is unreachable for this spec's small conversations, and failing
 * closed here never masks the negotiated limit.
 */
function requireEncodableProjection(
  channel: Pick<SnowCompanionProtocolChannel, 'canEncode'>,
  projection: CompanionProjection,
): CompanionProjection {
  if (!channel.canEncode({ type: 'projection', projection })) {
    throw new Error('assembled live projection exceeds its negotiated wire limit')
  }
  return projection
}

async function countTurnEnds(home: string, sessionId: string): Promise<number> {
  const log = await durableSessionLog(home, sessionId)
  return (log.match(/"type":"turn\/end"/g) ?? []).length
}

function pairingDependencies(
  owner: InstanceType<typeof DesktopCompanionProductOwner>,
  channels: Awaited<ReturnType<typeof snowProductChannels>>,
  currentDesktopRevision: number,
): Parameters<InstanceType<typeof DesktopCompanionProductOwner>['handle']>[1] {
  const attachmentKey = channels.attachmentKey.slice()
  return {
    pairingId: parsePersonalPairingId(channels.pairingSelector),
    attachmentKey,
    now: Date.now,
    generation: channels.generation,
    desktopRevision: currentDesktopRevision,
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
    routeId: parseRelayRouteId('route-assembled-snow'), endpoint: 'mobile',
    credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never, revision: 1,
  })
  runtime.markConnectionOpen()
  return runtime
}

async function snowProductChannels(): Promise<{
  mobile: SnowCompanionProtocolChannel
  desktop: SnowCompanionProtocolChannel
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
  const pairingSelector = parseRelayPairingSelector('pairing-assembled-snow')
  const grant = {
    routeId: parseRelayRouteId('route-assembled-snow'), endpoint: 'mobile' as const,
    credential: await generateRelayCredential(), revision: 1, pairingSelector,
  }
  const sealedGrant = await desktopPairing.sealMobileRelayAuthority(grant, attachmentKey)
  await mobilePairing.openRelayAuthority(sealedGrant)
  const desktopAttachmentId = parseRelayAttachmentId('desktop-assembled-snow')
  const mobileAttachmentId = parseRelayAttachmentId('mobile-assembled-snow')
  const generation = 1
  const binding = {
    routeId: grant.routeId, pairingSelector, desktopAttachmentId, mobileAttachmentId, generation,
  }
  const initiator = await beginSnowMobileReconnect(mobilePairing.exportReconnectState(), binding)
  const responder = await acceptSnowDesktopReconnect(desktopPairing.exportReconnectState(), binding, initiator.message1)
  const mobileNegotiation = beginSnowCompanionProtocol(initiator.finish(responder.message2), 'mobile')
  const desktopNegotiation = beginSnowCompanionProtocol(responder.channel, 'desktop')
  return {
    mobile: mobileNegotiation.finish(desktopNegotiation.payload),
    desktop: desktopNegotiation.finish(mobileNegotiation.payload),
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

function isProjection(value: CompanionProjection | CompanionResult): value is CompanionProjection {
  return value.type === 'foreground-sync' || value.type === 'transcript-page'
    || value.type === 'surface-snapshot' || value.type === 'conversation-snapshot'
    || value.type === 'session-live' || value.type === 'member-question-state'
    || value.type === 'document-transfer-state'
}

function isResultList(value: unknown): value is readonly CompanionResult[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
