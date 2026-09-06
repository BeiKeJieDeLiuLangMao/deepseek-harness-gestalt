/** Ask User question answering through Snow, owner, and shipped dsh web. */

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
  type CompanionOperationId,
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

describe('assembled Desktop Companion Ask User question on shipped dsh web', () => {
  it('answers one real Host ask_user_question wait through the Mobile surface', async () => {
    const apiKey = 'desktop-assembled-snow-question-key'
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'],
      repeatLast: true,
      apiKey,
      toolName: 'ask_user_question',
      toolArguments: JSON.stringify({
        questions: [{ id: 'q1', question: 'Proceed?', options: [{ label: 'Yes' }, { label: 'No' }] }],
      }),
      successText: 'acknowledged-snow-question',
    })
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
    const sessionId = parseCompanionSessionId('desktop-snow-question-session')
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-question-operations.json')),
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
    const settleOperationIds: CompanionOperationId[] = []
    const originalHandle = owner.handle.bind(owner)
    owner.handle = async (operation, dependencies) => {
      if (operation.type === 'settle-interaction') settleOperationIds.push(operation.operationId)
      return await originalHandle(operation, dependencies)
    }
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-snow-question'),
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
    const localSessionId = sessionId as SessionId
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(localSessionId)).toBe(true)
    await surface.submit(localSessionId, 'ask the user one snow question')
    await expect.poll(() => llm.requests.length > 0).toBe(true)
    await expect.poll(() => {
      const pending = surface.getSnapshot().conversations[localSessionId]?.pending ?? []
      if (pending.some(wait => wait.kind === 'question')) return true
      // Pending waits project through the Desktop load-history conversation
      // snapshot; this poll is the history observation that surfaces them.
      if (surface.getSnapshot().conversations[localSessionId]?.loadingOlder !== true) {
        surface.loadOlder(localSessionId)
      }
      return false
    }).toBe(true)
    const pendingQuestion = surface.getSnapshot().conversations[localSessionId]?.pending
      .find((wait): wait is Extract<typeof wait, { kind: 'question' }> => wait.kind === 'question')
    if (pendingQuestion === undefined) throw new Error('Mobile surface never received the Ask User wait')
    await expect(pendingQuestion.answer({ answers: [{ id: 'q1', selected: ['Yes'] }] })).resolves.toBeUndefined()
    await expect.poll(() => settleOperationIds.length).toBe(1)
    const settleOperationId = settleOperationIds[0]
    if (settleOperationId === undefined) throw new Error('Companion settlement did not reach the Desktop owner')
    await expect.poll(async () => await owner.queryOperationStatus(
      parsePersonalPairingId(channels.pairingSelector), settleOperationId,
    )).toMatchObject({
      type: 'status', operationId: settleOperationId,
      committed: { type: 'interaction-receipt', operationId: settleOperationId, accepted: true },
    })
    await expect.poll(async () => {
      const log = await durableSessionLog(first.home, sessionId)
      const result = settledAskUserResult(log)
      return result !== undefined
        && finalAssistantTextAfter(log, result.callId) !== undefined
        && log.includes('"type":"turn/end"')
    }).toBe(true)
    const toolResult = settledAskUserResult(await durableSessionLog(first.home, sessionId))
    if (toolResult === undefined) throw new Error('settled ask_user_question tool/result never reached the Host log')
    const toolCall = await askUserToolCallIdFromLog(first.home, sessionId)
    expect(toolResult.callId).toBe(toolCall)
    expect(toolResult.answers).toEqual([{ id: 'q1', selected: ['Yes'] }])
    const finalText = finalAssistantTextAfter(await durableSessionLog(first.home, sessionId), toolResult.callId)
    expect(finalText).toBe('acknowledged-snow-question')
    expect(surface.getSnapshot().operationFailure).toBeUndefined()
    await expect.poll(() => answeredFollowUpRequest(llm.requests)).not.toBeUndefined()
    const followUp = answeredFollowUpRequest(llm.requests)
    if (followUp === undefined) throw new Error('the answered follow-up model request never arrived')
    const followUpBody = JSON.stringify(followUp.body)
    expect(followUpBody).toContain('q1')
    expect(followUpBody).toContain('Yes')
    expect(owner.pendingInteractions(sessionId, channels.attachmentKey.slice())).toHaveLength(0)
  }, 180_000)
})

interface SettledAskUserResult {
  readonly callId: string
  readonly answers: unknown
}

/**
 * Parse the durable log for the ask_user_question tool/result whose payload
 * carries the Mobile answer, keyed to the Assistant tool-call id.
 */
function settledAskUserResult(log: string): SettledAskUserResult | undefined {
  const callId = askUserToolCallId(log)
  if (callId === undefined) return undefined
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"tool/result"')) continue
    const event = JSON.parse(line) as { data?: { message?: { content?: unknown } } }
    const blocks = event.data?.message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== 'tool-result' || block.toolCallId !== callId) continue
      const parts = block.content
      if (!Array.isArray(parts) || !isRecord(parts[0]) || typeof parts[0].text !== 'string') return undefined
      try {
        const parsed = JSON.parse(parts[0].text) as { answers?: unknown }
        return { callId, answers: parsed.answers }
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

function askUserToolCallId(log: string): string | undefined {
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"assistant/message"') || !line.includes('ask_user_question')) continue
    const event = JSON.parse(line) as { data?: { message?: { content?: unknown } } }
    const blocks = event.data?.message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== 'tool-call' || block.name !== 'ask_user_question') continue
      return typeof block.id === 'string' ? block.id : undefined
    }
  }
  return undefined
}

/**
 * The final assistant text of the turn, proven to follow the settled
 * ask_user_question result in durable-log sequence order.
 */
function finalAssistantTextAfter(log: string, callId: string): string | undefined {
  const resultSeq = settledAskUserResultSeq(log, callId)
  if (resultSeq === undefined) return undefined
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"assistant/message"')) continue
    const event = JSON.parse(line) as { seq?: unknown; data?: { message?: { content?: unknown } } }
    if (typeof event.seq !== 'number' || event.seq <= resultSeq) continue
    const blocks = event.data?.message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') continue
      return block.text
    }
  }
  return undefined
}

function settledAskUserResultSeq(log: string, callId: string): number | undefined {
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"tool/result"') || !line.includes(callId)) continue
    const event = JSON.parse(line) as { seq?: unknown }
    return typeof event.seq === 'number' ? event.seq : undefined
  }
  return undefined
}

/**
 * Read the Assistant ask_user_question tool-call id straight from the durable
 * log so the settled result is correlated with the exact originating call.
 */
async function askUserToolCallIdFromLog(
  home: string,
  sessionId: ReturnType<typeof parseCompanionSessionId>,
): Promise<string | undefined> {
  const log = await durableSessionLog(home, sessionId)
  return askUserToolCallId(log)
}

/** The first model request whose wire body carries the answered tool result. */
function answeredFollowUpRequest(requests: readonly { readonly body: unknown }[]): { body: unknown } | undefined {
  for (const request of requests) {
    if (!isRecord(request.body)) continue
    const body = JSON.stringify(request.body)
    if (body.includes('tool_call_id') && body.includes('q1') && body.includes('Yes')) {
      return { body: request.body }
    }
  }
  return undefined
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
    downloadAttachment: () => Promise.reject(new Error('question must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('question must not submit an attachment')),
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
}

function isResultList(value: unknown): value is readonly CompanionResult[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
