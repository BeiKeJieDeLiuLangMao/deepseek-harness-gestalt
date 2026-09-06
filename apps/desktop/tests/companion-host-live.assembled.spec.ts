/** Live Session projection through Snow to the Mobile surface without manual history pulls. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob, readFile } from 'node:fs/promises'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseCompanionSessionId,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionMessage,
  type CompanionProjection,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
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
    const llm = await startMockLlmServer({ sequence: ['slow_success'], repeatLast: true, apiKey, successText: 'live-projected-answer', chunkDelayMs: 100 })
    cleanups.push(async () => { await llm.close() })
    const first = await startShippedWebHost({
      children, homes,
      env: { DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: llm.baseURL },
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
    let desktopRevision = 1
    const observedChange: { current?: DesktopCompanionLiveProjectionChange } = {}
    const liveTasks = new Set<Promise<void>>()
    const liveErrors: unknown[] = []
    const projectChange = async (change: DesktopCompanionLiveProjectionChange): Promise<void> => {
      const receiver = receiverRef.current
      // Before the Mobile receiver installs, no authenticated channel exists;
      // the Desktop Relay owner drops these projections the same way.
      if (receiver === undefined) return
      if (change.type === 'surface') {
        // This direct-channel bridge has no relay reconnect semantics; the
        // assembled receiver keeps its completed surface and the next session
        // change carries any authority update in its own projection.
        return
      }
      const payload = await owner.projectLiveSession(change, channels.attachmentKey.slice(), new AbortController().signal)
      const projection: CompanionProjection = {
        type: 'session-live', generation: channels.generation,
        desktopRevision: desktopRevision += 1,
        ...payload,
      } as CompanionProjection
      receiver.receive(channels.desktop.seal(boundLiveProjection(channels.desktop, projection)))
    }
    const disposeLive = owner.connectLiveProjection(
      parsePersonalPairingId(channels.pairingSelector),
      (change) => {
        observedChange.current = change
        const task = projectChange(change)
        liveTasks.add(task)
        void task.then(() => { liveTasks.delete(task) }, (error) => {
          liveTasks.delete(task)
          liveErrors.push(error)
        })
      },
      (error) => { liveErrors.push(error) },
    )
    uninstalls.push(disposeLive)
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
        const output = await owner.handle(opened.operation, pairingDependencies(owner, channels))
        const receiver = receiverRef.current
        if (receiver === undefined) throw new Error('assembled Mobile receiver is not installed')
        for (const item of isResultList(output) ? output : [output]) {
          const projection = isProjection(item)
            ? { ...item, generation: channels.generation, desktopRevision: desktopRevision += 1 } as CompanionProjection
            : undefined
          receiver.receive(channels.desktop.seal(projection === undefined
            ? { type: 'result', result: item }
            : { type: 'projection', projection }))
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
    receiver.receive(channels.desktop.seal({
      type: 'projection',
      projection: {
        type: 'foreground-sync', desktopName: 'Assembled Desktop',
        generation: channels.generation, desktopRevision: 1,
      },
    }))
    const localSessionId = sessionId as SessionId
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(localSessionId)).toBe(true)
    surface.observeSession(localSessionId)
    await expect.poll(() => observedChange.current?.type === 'session'
      && observedChange.current.sessionId === sessionId
      && observedChange.current.includeConversation === true).toBe(true)
    await expect.poll(() => surface.getSnapshot().sessions.byId[localSessionId] !== undefined).toBe(true)
    surface.submit(localSessionId, 'project this turn live')
    // Live replacements merge the streaming turn into the final conversation;
    // the asserted contract is that the completed turn ARRIVES without any
    // manual history pull, not that every intermediate running state is sampled.
    await expect.poll(() => {
      if (liveErrors.length > 0) throw new Error(`live projection failed: ${String(liveErrors[0])}`)
      const conversation = surface.getSnapshot().conversations[localSessionId]
      if (conversation === undefined) return false
      const userNode = conversation.nodes.some(node => isRecord(node) && node.kind === 'user')
      const assistantNode = conversation.nodes.some(node => isRecord(node)
        && node.kind === 'assistant'
        && Array.isArray(node.blocks)
        && node.blocks.some(block => isRecord(block) && block.kind === 'text' && block.text === 'live-projected-answer'))
      return conversation.running === false && userNode && assistantNode
    }, { timeout: 60_000 }).toBe(true)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    const log = await durableSessionLog(first.home, sessionId)
    expect(log).toContain('live-projected-answer')
    expect(log).toContain('"type":"turn/end"')
    disposeLive()
    const nodesBeforeDisconnect = surface.getSnapshot().conversations[localSessionId]?.nodes.length ?? 0
    const second = parseCompanionSessionId('desktop-snow-live-after-disconnect')
    await expect(createDesktopHostSession(rpc, second)).resolves.toMatchObject({ ok: true })
    await expect(owner.handle({
      type: 'submit-prompt', operationId: parseOperationId('live-after-disconnect-prompt'),
      sessionId: second, text: 'host continues without the projected connection',
    }, pairingDependencies(owner, channels))).resolves.toMatchObject({ type: 'confirmed' })
    await expect.poll(() => durableSessionLog(first.home, second).then(text => text.includes('turn/end'))).toBe(true)
    expect(surface.getSnapshot().sessions.ids).not.toContain(second as SessionId)
    expect(surface.getSnapshot().conversations[localSessionId]?.nodes.length).toBe(nodesBeforeDisconnect)
  }, 180_000)
})

function boundLiveProjection(
  channel: Pick<SnowCompanionProtocolChannel, 'canEncode'>,
  projection: CompanionProjection,
): CompanionMessage['projection'] extends never ? never : { type: 'projection'; projection: CompanionProjection } {
  const message = { type: 'projection' as const, projection }
  if (channel.canEncode(message)) return message
  if ('conversation' in projection && projection.conversation !== undefined) {
    const { conversation: _conversation, ...summary } = projection
    if (channel.canEncode({ type: 'projection', projection: summary as CompanionProjection })) {
      return { type: 'projection', projection: summary as CompanionProjection }
    }
  }
  throw new Error('assembled live projection summary exceeds its negotiated wire limit')
}

function parseOperationId(value: string): Parameters<
  ReturnType<typeof import('../src/companion-product.ts')['DesktopCompanionProductOwner']>['handle']
>[0]['operationId'] {
  return value as never
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
    desktopRevision: 1,
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
    || value.type === 'session-live'
}

function isResultList(value: unknown): value is readonly CompanionResult[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
