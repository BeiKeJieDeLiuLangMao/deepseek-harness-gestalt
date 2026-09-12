/** Initial Host history and image bytes through Snow into the Mobile surface. */

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
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession, promptDesktopHostSession,
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
  const errors: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup() } catch (error) { errors.push(error) }
  }
  for (const uninstall of uninstalls.splice(0).reverse()) {
    try { uninstall() } catch (error) { errors.push(error) }
  }
  try { await stopShippedWebHosts(children, homes) } catch (error) { errors.push(error) }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'history image fixture teardown failed')
})

describe('assembled Desktop Companion history image on shipped dsh web', () => {
  it('loads persisted user and assistant history then reads its exact image through Snow', async () => {
    const apiKey = 'desktop-assembled-history-image-key'
    const llm = await startMockLlmServer({ sequence: ['success'], apiKey, successText: 'persisted assistant answer' })
    cleanups.push(async () => { await llm.close() })
    const first = await startShippedWebHost({
      children, homes,
      env: { DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: llm.baseURL },
      extraPatches: [join(import.meta.dirname, 'fixtures/snow-question-no-title.patch.yml')],
    })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes, cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId('desktop-history-image-session')
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true, value: { sessionId } })
    await expect(rpc.call('session/selectModel', {
      args: { request: {
        sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp',
      } },
    })).resolves.toMatchObject({ ok: true })
    const hostFrames: unknown[] = []
    const follow = new AbortController()
    const watching = rpc.followSession(sessionId, follow.signal, (frame) => { hostFrames.push(frame) })
    cleanups.push(async () => { follow.abort(); await watching })
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    await expect(promptDesktopHostSession(rpc, {
      requestId: 'desktop-history-image-prompt', sessionId, mode: 'queue',
      content: [
        { type: 'text', text: 'persist this image history' },
        { type: 'image', mediaType: 'image/png', data: png.toString('base64'), name: 'pixel.png' },
      ],
    })).resolves.toMatchObject({ ok: true, value: { accepted: true } })
    await expect.poll(() => llm.requests.length).toBe(1)
    await expect.poll(() => imageAttachment(hostFrames)).toMatchObject({ mediaType: 'image/png' })
    const persistedImage = imageAttachment(hostFrames)
    if (!isRecord(persistedImage) || typeof persistedImage.attachmentId !== 'string') {
      throw new Error('Host did not persist the image attachment')
    }

    const owner = productOwner(first.running.url, cookie)
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-history-image-operations.json')),
    ))
    const channels = await snowProductChannels()
    cleanups.push(async () => {
      channels.mobile.dispose()
      channels.desktop.dispose()
      channels.attachmentKey.fill(0)
    })
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const surface = new MobileCompanionSurface(runtime)
    const received: CompanionResult[] = []
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-history-image'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
      trackHistoryRefresh: (id, submission) => { surface.trackHistoryRefresh(id, submission) },
      sendCiphertext: async (_target, ciphertext) => {
        const opened = channels.desktop.open(ciphertext)
        if (opened.type !== 'operation') throw new Error('Desktop expected a Companion operation')
        const output = opened.operation.type === 'query-operation-status'
          ? await owner.queryOperationStatus(parsePersonalPairingId(channels.pairingSelector), opened.operation.operationId)
          : await owner.handle(opened.operation, pairingDependencies(owner, channels))
        const receiver = receiverRef.current
        if (receiver === undefined) throw new Error('Mobile receiver is not installed')
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
        received.push(result)
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
    surface.loadOlder(localSessionId)
    await expect.poll(() => historyEvidence(surface, localSessionId)).toMatchObject({
      userText: true, assistantText: true,
      attachment: expect.objectContaining({
        attachmentId: persistedImage.attachmentId, mediaType: 'image/png',
      }) as unknown,
    })
    const history = historyEvidence(surface, localSessionId)
    if (history.attachment === undefined) throw new Error('Mobile history did not project its image attachment')
    const before = received.length
    const dataUrl = await surface.loadImage(localSessionId, history.attachment as never)
    await expect.poll(() => received.slice(before).some(result => result.type === 'image-chunk')).toBe(true)
    const match = /^data:image\/png;base64,(.+)$/u.exec(dataUrl)
    if (match?.[1] === undefined) throw new Error('Mobile image result was not a PNG data URL')
    expect(Buffer.from(match[1], 'base64')).toEqual(png)
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
  }, 180_000)
})

function historyEvidence(surface: MobileCompanionSurface, sessionId: SessionId): {
  userText: boolean
  assistantText: boolean
  attachment?: Record<string, unknown>
} {
  const nodes = surface.getSnapshot().conversations[sessionId]?.nodes ?? []
  let userText = false
  let attachment: Record<string, unknown> | undefined
  for (const node of nodes) {
    if (!isRecord(node) || node.kind !== 'user' || !Array.isArray(node.content)) continue
    for (const block of node.content) {
      if (!isRecord(block)) continue
      if (block.type === 'text' && block.text === 'persist this image history') userText = true
      if (block.type === 'image' && isRecord(block.attachment)) attachment = block.attachment
    }
  }
  const assistantText = nodes.some(node => isRecord(node) && node.kind === 'assistant' && Array.isArray(node.blocks)
    && node.blocks.some(block => isRecord(block) && block.kind === 'text' && block.text === 'persisted assistant answer'))
  return { userText, assistantText, ...(attachment === undefined ? {} : { attachment }) }
}

function imageAttachment(frames: readonly unknown[]): unknown {
  for (const frame of frames) {
    const records = isRecord(frame) && frame.type === 'snapshot' && Array.isArray(frame.records)
      ? frame.records
      : [isRecord(frame) ? frame.event : undefined]
    for (const record of records) {
      const event: unknown = isRecord(record) && isRecord(record.event) ? record.event : record
      if (!isRecord(event) || event.type !== 'user/message' || !isRecord(event.data)
        || !Array.isArray(event.data.content)) continue
      const image: unknown = event.data.content.find(block => isRecord(block) && block.type === 'image')
      if (isRecord(image) && isRecord(image.attachment)) return image.attachment
    }
  }
  return undefined
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
): import('../src/companion-product.ts').DesktopCompanionPairingDependencies {
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
