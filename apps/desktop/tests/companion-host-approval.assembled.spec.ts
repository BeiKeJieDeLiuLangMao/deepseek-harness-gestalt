/** Ask User question answering through Snow, owner, and shipped dsh web. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseCompanionOperationId,
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

describe('assembled Desktop Companion Approval on shipped dsh web', () => {
  it.each([
    ['allowed-once', true],
    ['rejected', false],
  ] as const)('settles a real Host bash approval as %s through the Mobile surface', async (outcome, expectWritten) => {
    const apiKey = `desktop-snow-approval-${outcome}`
    const sessionId = parseCompanionSessionId(`desktop-snow-approval-${outcome}-session`)
    const home = await mkdtemp(join(tmpdir(), `dsh-snow-approval-${outcome}-`))
    homes.push(home)
    const marker = join(home, 'approval-marker.txt')
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'],
      apiKey,
      toolName: 'bash',
      toolArguments: JSON.stringify({
        command: `printf approval-${outcome} > ${JSON.stringify(marker)}`,
        description: 'Write the isolated approval marker',
        sandbox_permissions: 'danger-full-access',
        justification: 'The assembled approval test verifies the selected outcome.',
      }),
      successText: `approval-${outcome}-done`,
    })
    cleanups.push(async () => { await llm.close() })
    const first = await startShippedWebHost({
      children, homes, home,
      env: {
        DEEPSEEK_API_KEY: apiKey, DEEPSEEK_BASE_URL: llm.baseURL,
        DSH_PERMISSION_MODE: 'workspace-write',
      },
      extraPatches: [join(import.meta.dirname, 'fixtures/snow-question-no-title.patch.yml')],
    })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes, cookieHeader: cookie,
    })
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true, value: { sessionId } })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-approval-operations.json')),
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
    const settlementIds: CompanionOperationId[] = []
    const originalHandle = owner.handle.bind(owner)
    owner.handle = async (operation, dependencies) => {
      if (operation.type === 'settle-interaction') settlementIds.push(operation.operationId)
      return await originalHandle(operation, dependencies)
    }
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement(`desktop-snow-approval-${outcome}`),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'approval-installation',
        proof: { jti: 'approval-proof' as never, issuedAt: 1, signature: 'approval-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
      trackHistoryRefresh: (id, submission) => { surface.trackHistoryRefresh(id, submission) },
      sendCiphertext: async (_target, ciphertext) => {
        const opened = channels.desktop.open(ciphertext)
        if (opened.type !== 'operation') throw new Error('Desktop expected a Companion operation')
        const output = await owner.handle(opened.operation, pairingDependencies(owner, channels))
        const receiver = receiverRef.current
        if (receiver === undefined) throw new Error('Mobile receiver is not installed')
        for (const item of isResultList(output) ? output : [output]) {
          receiver.receive(channels.desktop.seal(isProjection(item)
            ? { type: 'projection', projection: item }
            : { type: 'result', result: item }))
        }
      },
    })
    const receiver = new MobileNoiseCompanionReceiver(
      channels.mobile, channels.generation, runtime,
      () => ({ acceptValidatedCompanionResult: (result) => {
        product.acceptResult(result)
        surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
      } }),
      () => surface.bindAuthenticatedConnection({
        mutations: product,
        content: { loadImage: async (id: never, attachment: never) => await product.loadImage(id, attachment) },
      }),
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
    await surface.submit(localSessionId, 'run the approval-gated bash write')
    await expect.poll(() => {
      const pending = surface.getSnapshot().conversations[localSessionId]?.pending ?? []
      if (pending.some(wait => wait.kind === 'approval')) return true
      if (surface.getSnapshot().conversations[localSessionId]?.loadingOlder !== true) surface.loadOlder(localSessionId)
      return false
    }).toBe(true)
    const approval = surface.getSnapshot().conversations[localSessionId]?.pending.find(wait => wait.kind === 'approval')
    if (approval === undefined || approval.kind !== 'approval') throw new Error('Mobile surface never received the Approval wait')
    await expect(approval.answer(outcome)).resolves.toBeUndefined()
    await expect.poll(() => settlementIds.length).toBe(1)
    const settlementId = settlementIds[0]
    if (settlementId === undefined) throw new Error('Approval settlement did not reach Desktop')
    await expect.poll(async () => await owner.queryOperationStatus(
      parsePersonalPairingId(channels.pairingSelector), settlementId,
    )).toMatchObject({
      type: 'status', operationId: settlementId,
      committed: { type: 'interaction-receipt', operationId: settlementId, accepted: true },
    })
    const replay = {
      type: 'settle-interaction' as const,
      operationId: settlementId,
      sessionId,
      interactionId: approval.interactionId,
      settlement: { kind: 'approval' as const, outcome },
    }
    await expect(owner.handle(replay, pairingDependencies(owner, channels))).resolves.toMatchObject({
      type: 'interaction-receipt', operationId: settlementId, accepted: true,
    })
    await expect(owner.handle({
      ...replay,
      operationId: parseCompanionOperationId(`desktop-snow-approval-${outcome}-late`),
      settlement: { kind: 'approval', outcome: 'rejected' },
    }, pairingDependencies(owner, channels))).resolves.toMatchObject({
      type: 'interaction-receipt', accepted: false, reason: 'not-pending',
    })
    const log = await approvalResultLog(first.home, sessionId)
    const bashResult = bashToolResult(log)
    if (bashResult === undefined) throw new Error('the approval-gated bash tool/result never reached the Host log')
    expect(turnEndedAfter(log, bashResult.seq)).toBe(true)
    if (expectWritten) {
      expect(bashResult.isError).toBe(false)
      expect(bashResult.text).not.toContain('the user rejected escalating this command')
      await expect(readFile(marker, 'utf8')).resolves.toBe(`approval-${outcome}`)
    } else {
      expect(bashResult.isError).toBe(true)
      expect(bashResult.text).toContain('the user rejected escalating this command')
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
    expect(owner.pendingInteractions(sessionId, channels.attachmentKey.slice())).toHaveLength(0)
  }, 180_000)
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function turnEndedAfter(log: string, seq: number): boolean {
  return log.split('\n').some((line) => {
    if (!line.includes('"type":"turn/end"')) return false
    const event = JSON.parse(line) as { seq?: unknown }
    return typeof event.seq === 'number' && event.seq > seq
  })
}

function bashToolResult(log: string): { callId: string; isError: boolean; seq: number; text: string } | undefined {
  let callId: string | undefined
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"assistant/message"') || !line.includes('"name":"bash"')) continue
    const event = JSON.parse(line) as { seq?: unknown; data?: { message?: { content?: unknown } } }
    const content = event.data?.message?.content
    if (!Array.isArray(content)) continue
    const call = content.find(block => isRecord(block) && block.type === 'tool-call' && block.name === 'bash')
    if (isRecord(call) && typeof call.id === 'string') callId = call.id
  }
  if (callId === undefined) return undefined
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"tool/result"')) continue
    const event = JSON.parse(line) as { seq?: unknown; data?: { message?: { content?: unknown } } }
    const content = event.data?.message?.content
    if (!Array.isArray(content)) continue
    const result = content.find(block => isRecord(block) && block.type === 'tool-result' && block.toolCallId === callId)
    if (!isRecord(result) || !Array.isArray(result.content)) continue
    const text = result.content.find(part => isRecord(part) && typeof part.text === 'string')
    if (isRecord(text) && typeof text.text === 'string' && typeof event.seq === 'number') {
      return { callId, isError: result.isError === true, seq: event.seq, text: text.text }
    }
  }
  return undefined
}

async function approvalResultLog(home: string, sessionId: string): Promise<string> {
  await expect.poll(async () => {
    const log = await durableSessionLog(home, sessionId)
    const result = bashToolResult(log)
    return result !== undefined && turnEndedAfter(log, result.seq)
  }).toBe(true)
  return await durableSessionLog(home, sessionId)
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
