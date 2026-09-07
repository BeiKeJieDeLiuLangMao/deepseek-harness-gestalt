/** Browse Surface submit/cancel/history through Snow, owner, and shipped dsh web. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  type CompanionOperationId,
  type CompanionProjection,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession, listDesktopHostSessions,
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

describe('assembled Desktop Companion submit and cancel on shipped dsh web', () => {
  it('submits through Surface into a real Host turn then cancels after turn/start', async () => {
    const apiKey = 'desktop-assembled-surface-prompt-key'
    const llm = await startMockLlmServer({ sequence: ['stall'], apiKey })
    cleanups.push(async () => { await llm.close() })
    const first = await startShippedWebHost({
      children, homes,
      env: { DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: llm.baseURL },
    })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId('desktop-surface-prompt-session')
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const hostFrames: unknown[] = []
    const follow = new AbortController()
    const watching = rpc.followSession(sessionId, follow.signal, (frame) => { hostFrames.push(frame) })
    cleanups.push(async () => {
      follow.abort()
      await watching
    })
    const owner = productOwner(first.running.url, cookie)
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-prompt-operations.json')),
    ))
    const channels = await snowProductChannels()
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const surface = new MobileCompanionSurface(runtime)
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-surface-prompt'),
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
          : await owner.handle(opened.operation, pairingDependencies(owner, channels))
        const receiver = receiverRef.current
        if (receiver === undefined) throw new Error('assembled Mobile receiver is not installed')
        for (const item of isResultList(output) ? output : [output]) {
          receiver.receive(channels.desktop.seal(isProjection(item)
            ? { type: 'projection', projection: item }
            : { type: 'result', result: item }))
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
    const localSessionId = SessionId(sessionId)
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(localSessionId)).toBe(true)
    const prompt = 'submitted through Companion v3'
    await surface.submit(localSessionId, prompt)
    await expect.poll(() => llm.requests.length > 0).toBe(true)
    await expect.poll(() => {
      if (conversationHasUserText(surface, localSessionId, prompt)) return true
      if (surface.getSnapshot().conversations[localSessionId]?.loadingOlder !== true) {
        surface.loadOlder(localSessionId)
      }
      return false
    }).toBe(true)
    await expect.poll(() => surface.getSnapshot().conversations[localSessionId]?.running === true).toBe(true)
    await expect.poll(() => hostFrames.some(frame => followHasEventType(frame, 'turn/start'))).toBe(true)
    const llmCallsBeforeCancel = llm.requests.length
    const cancelOperationIds: CompanionOperationId[] = []
    const originalHandle = owner.handle.bind(owner)
    owner.handle = async (operation, dependencies) => {
      if (operation.type === 'cancel-session') cancelOperationIds.push(operation.operationId)
      return await originalHandle(operation, dependencies)
    }
    surface.cancel(localSessionId)
    await expect.poll(() => cancelOperationIds.length).toBe(1)
    const cancelOperationId = cancelOperationIds[0]
    if (cancelOperationId === undefined) throw new Error('Companion cancel did not reach the Desktop owner')
    await expect.poll(async () => await owner.queryOperationStatus(
      parsePersonalPairingId(channels.pairingSelector), cancelOperationId,
    )).toMatchObject({
      type: 'status', operationId: cancelOperationId,
      committed: { type: 'confirmed', operationId: cancelOperationId, outcome: 'accepted' },
    })
    await expect.poll(() => hostFrames.some(frame => followHasEventType(frame, 'turn/end'))).toBe(true)
    expect(llm.requests[0]?.outcome).toBe('stalled')
    await expect.poll(() => surface.getSnapshot().conversations[localSessionId]?.running === false).toBe(true)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    expect(llm.requests.length).toBe(llmCallsBeforeCancel)
    const listed = await listDesktopHostSessions(rpc)
    expect(listed.ok).toBe(true)
    if (!listed.ok || !isRecord(listed.value) || !Array.isArray(listed.value.items)) {
      throw new Error('Desktop Host session/list returned an invalid value')
    }
    const row = listed.value.items.find(item => isRecord(item) && item.sessionId === sessionId)
    expect(isRecord(row) && row.running === false).toBe(true)
  }, 180_000)
})

function followHasEventType(frame: unknown, type: string): boolean {
  if (!isRecord(frame)) return false
  if (frame.type === 'event') return isRecord(frame.event) && frame.event.type === type
  if (frame.type !== 'snapshot' || !Array.isArray(frame.records)) return false
  return frame.records.some(record => isRecord(record) && isRecord(record.event) && record.event.type === type)
}

function conversationHasUserText(
  surface: MobileCompanionSurface,
  sessionId: SessionId,
  text: string,
): boolean {
  const nodes = surface.getSnapshot().conversations[sessionId]?.nodes ?? []
  return nodes.some((node) => {
    if (!isRecord(node) || node.kind !== 'user' || !Array.isArray(node.content)) return false
    return node.content.some(block => isRecord(block) && block.type === 'text' && block.text === text)
  })
}

function productOwner(baseUrl: string, cookieHeader: string): InstanceType<typeof DesktopCompanionProductOwner> {
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 15_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  uninstalls.push(owner.installHost(baseUrl, cookieHeader))
  return owner
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
    downloadAttachment: () => Promise.reject(new Error('submit must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('submit must not submit an attachment')),
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
