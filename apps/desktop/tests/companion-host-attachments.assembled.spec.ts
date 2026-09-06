/** Companion search and attachment admission through Snow and shipped dsh web. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob, readFile } from 'node:fs/promises'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential, parseCompanionSessionId, parseRelayAttachmentId, parseRelayPairingSelector,
  parseRelayRouteId, REMOTE_PROTOCOL_LIMITS, type CompanionOperation, type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient, type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession, promptDesktopHostSession,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import { DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore } from '../src/companion-operation-ledger.ts'
import { generateDesktopHostTypertArtifacts, startShippedWebHost, stopShippedWebHosts } from './shipped-web-host.ts'
import { decompressZstdFrame, scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { CompanionForegroundRuntime } from '../../mobile/src/companion-lifecycle.ts'
import { CompanionUncertainOperationSettlement, InMemoryCompanionCacheStore, parseCompanionDesktopId } from '../../mobile/src/companion-cache.ts'
import { MobileSnowCompanionConnection, MobileSnowCompanionProductChannel } from '../../mobile/src/noise-companion-product.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  try {
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
  } finally {
    await stopShippedWebHosts(children, homes)
  }
})

describe('assembled Desktop Companion attachments on shipped dsh web', () => {
  it('searches and admits binary, image, and text files through Snow idempotently', async () => {
    const first = await startShippedWebHost({ children, homes })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000, attachmentTimeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes, cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId('desktop-snow-attachment-session')
    const needle = 'desktop Snow attachment search needle'
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true, value: { sessionId } })
    await expect(promptDesktopHostSession(rpc, {
      requestId: 'desktop-snow-attachment-index', sessionId, mode: 'queue',
      content: [{ type: 'text', text: needle }],
    })).resolves.toMatchObject({ ok: true, value: { accepted: true } })

    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000, attachmentTimeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(first.home, 'companion-attachment-operations.json')),
    ))
    uninstalls.push(owner.installHost(first.running.url, cookie))
    const channels = await snowChannels()
    const runtime = synchronizedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    let ciphertext = new Uint8Array()
    const opened: CompanionOperation[] = []
    const results: CompanionResult[] = []
    const submitted: Array<{ name: string; mediaType: string; plaintext: Uint8Array }> = []
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: new CompanionUncertainOperationSettlement(
        new InMemoryCompanionCacheStore(), parseCompanionDesktopId('desktop-snow-attachments'),
      ),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'attachment-installation',
        proof: { jti: 'attachment-proof' as never, issuedAt: 1, signature: 'attachment-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://platform.example',
      sendCiphertext: async (_target, sealed) => {
        const message = channels.desktop.open(sealed)
        if (message.type !== 'operation') throw new Error('Desktop expected a Snow operation')
        opened.push(message.operation)
        const dependencies = {
          pairingId: parsePersonalPairingId(channels.pairingSelector),
          attachmentKey: channels.attachmentKey.slice(), now: Date.now,
          generation: channels.generation, desktopRevision: 1, desktopName: 'Assembled Desktop',
          downloadAttachment: async () => ciphertext.slice(),
          submitAttachment: async (input) => {
            submitted.push({ name: input.fileName, mediaType: input.mediaType, plaintext: input.plaintext.slice() })
            return await owner.submitAttachment(input)
          },
          resolveInteraction: (id: never) => owner.resolveInteraction(id, channels.attachmentKey),
          pendingInteractions: (id: never) => owner.pendingInteractions(id, channels.attachmentKey),
        }
        const result = await owner.handle(message.operation, dependencies)
        if (Array.isArray(result) || result.type === 'foreground-sync' || result.type === 'transcript-page'
          || result.type === 'surface-snapshot' || result.type === 'conversation-snapshot') {
          throw new Error('attachment operation returned a projection')
        }
        const openedResult = channels.mobile.open(channels.desktop.seal({ type: 'result', result: result as CompanionResult }))
        if (openedResult.type !== 'result') throw new Error('Mobile expected a Snow result')
        results.push(openedResult.result)
        product.acceptResult(openedResult.result)
      },
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === 'https://platform.example/v1/remote-attachments' && init?.method === 'POST') {
        ciphertext = new Uint8Array(await new Response(init?.body).arrayBuffer())
        return new Response(JSON.stringify({
          capability: 'A'.repeat(43), byteLength: ciphertext.byteLength, expiresAt: Date.now() + 60_000,
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      return await originalFetch(input, init)
    })
    try {
      let searchHit: CompanionResult | undefined
      await expect.poll(async () => {
        const search = product.search(needle)
        await search.completion
        const searchOperation = opened.find(operation => operation.operationId === search.operationId)
        expect(searchOperation).toMatchObject({ type: 'search-sessions', query: needle })
        searchHit = results.find(result => result.operationId === search.operationId)
        return searchHit?.type === 'session-search' && searchHit.items.some(item => item.sessionId === sessionId)
      }, { timeout: 15_000 }).toBe(true)
      expect(searchHit).toMatchObject({
        type: 'session-search', items: expect.arrayContaining([expect.objectContaining({ sessionId })]),
      })

      const expectedFiles = [
        ['payload.bin', 'application/octet-stream', Uint8Array.of(0, 255, 1, 2)],
        ['pixel.png', 'image/png', Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
        ['notes.txt', 'text/plain', new TextEncoder().encode('assembled exact text bytes')],
      ] as const
      for (const [name, mediaType, bytes] of expectedFiles) {
        const transfer = product.attach(sessionId, new File([bytes], name, { type: mediaType }))
        await transfer.completion
        const operation = opened.find(candidate => candidate.operationId === transfer.operationId)
        if (operation?.type !== 'offer-attachment') throw new Error(`missing Snow attachment operation for ${name}`)
        expect(operation).toMatchObject({ sessionId, fileName: name, mediaType })
        expect(operation.byteLength).toBeGreaterThan(bytes.byteLength)
        const replay = await owner.handle(operation, {
          pairingId: parsePersonalPairingId(channels.pairingSelector), attachmentKey: channels.attachmentKey.slice(),
          now: Date.now, generation: channels.generation, desktopRevision: 1, desktopName: 'Assembled Desktop',
          downloadAttachment: async () => ciphertext.slice(), submitAttachment: async input => await owner.submitAttachment(input),
          resolveInteraction: (id: never) => owner.resolveInteraction(id, channels.attachmentKey),
          pendingInteractions: (id: never) => owner.pendingInteractions(id, channels.attachmentKey),
        })
        expect(replay).toMatchObject({ type: 'confirmed', operationId: transfer.operationId, outcome: 'accepted' })
        expect(opened.filter(candidate => candidate.operationId === transfer.operationId)).toHaveLength(1)
      }
      expect(submitted).toHaveLength(3)
      const durableLog = await durableSessionLog(first.home, sessionId)
      const admitted = admittedAttachments(durableLog)
      expect(admitted).toHaveLength(3)
      for (const [index, [name, mediaType, bytes]] of expectedFiles.entries()) {
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        expect(admitted[index]).toMatchObject({
          operationId: opened.filter(operation => operation.type === 'offer-attachment')[index]?.operationId,
          attachment: { name, mediaType, bytes: bytes.byteLength, sha256 },
        })
        const stored = new Uint8Array(await readFile(join(
          first.home, '.dsh', 'attachments', 'v1', 'objects', sha256.slice(0, 2), sha256,
        )))
        expect(stored).toEqual(bytes)
        expect(submitted[index]).toMatchObject({ name })
        expect(submitted[index]?.mediaType).toBe(mediaType)
        expect(submitted[index]?.plaintext).toEqual(bytes)
      }
    } finally {
      globalThis.fetch = originalFetch
      channels.attachmentKey.fill(0)
      channels.mobile.dispose()
      channels.desktop.dispose()
    }
  }, 180_000)
})

async function snowChannels(): Promise<{
  mobile: SnowCompanionProtocolChannel
  desktop: SnowCompanionProtocolChannel
  attachmentKey: Uint8Array
  pairingSelector: ReturnType<typeof parseRelayPairingSelector>
  desktopAttachmentId: ReturnType<typeof parseRelayAttachmentId>
  generation: number
}> {
  initializeSnowChannel(readFileSync(join(
    process.cwd(), 'packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm',
  )))
  const desktopPairing = new SnowDesktopEndpointPairingOwner()
  const invitation = await desktopPairing.createInvitation(Date.now() + 60_000)
  const mobilePairing = new SnowMobileHandshakeClient()
  const message1 = await mobilePairing.beginEndpointInvitation(invitation.invitationPayload)
  const message2 = await desktopPairing.acceptMessage1(message1)
  await mobilePairing.acceptDesktopHandshake(message2)
  await desktopPairing.finishMessage3(mobilePairing.exportFinishMessage())
  const attachmentKey = new Uint8Array(32).fill(43)
  const pairingSelector = parseRelayPairingSelector('pairing-snow-attachments')
  const grant = {
    routeId: parseRelayRouteId('route-snow-attachments'), endpoint: 'mobile' as const,
    credential: await generateRelayCredential(), revision: 1, pairingSelector,
  }
  await mobilePairing.openRelayAuthority(await desktopPairing.sealMobileRelayAuthority(grant, attachmentKey))
  const desktopAttachmentId = parseRelayAttachmentId('desktop-snow-attachments')
  const mobileAttachmentId = parseRelayAttachmentId('mobile-snow-attachments')
  const generation = 1
  const binding = { routeId: grant.routeId, pairingSelector, desktopAttachmentId, mobileAttachmentId, generation }
  const initiator = await beginSnowMobileReconnect(mobilePairing.exportReconnectState(), binding)
  const responder = await acceptSnowDesktopReconnect(desktopPairing.exportReconnectState(), binding, initiator.message1)
  const mobileNegotiation = beginSnowCompanionProtocol(initiator.finish(responder.message2), 'mobile')
  const desktopNegotiation = beginSnowCompanionProtocol(responder.channel, 'desktop')
  return {
    mobile: mobileNegotiation.finish(desktopNegotiation.payload),
    desktop: desktopNegotiation.finish(mobileNegotiation.payload),
    attachmentKey, pairingSelector, desktopAttachmentId, generation,
  }
}

function admittedAttachments(log: string): Array<{
  operationId: string
  attachment: { name?: string; mediaType: string; bytes: number; sha256: string }
}> {
  const values = []
  for (const line of log.split('\n')) {
    if (!line.includes('"type":"session/attachment-admitted"')) continue
    const event = JSON.parse(line) as { data?: { operationId?: unknown; attachment?: unknown } }
    const attachment = event.data?.attachment
    if (typeof event.data?.operationId !== 'string' || typeof attachment !== 'object' || attachment === null) continue
    const ref = attachment as Record<string, unknown>
    if (typeof ref.mediaType !== 'string' || typeof ref.bytes !== 'number' || typeof ref.sha256 !== 'string') continue
    values.push({
      operationId: event.data.operationId,
      attachment: {
        ...(typeof ref.name === 'string' ? { name: ref.name } : {}),
        mediaType: ref.mediaType, bytes: ref.bytes, sha256: ref.sha256,
      },
    })
  }
  return values
}

async function durableSessionLog(home: string, sessionId: string): Promise<string> {
  const root = join(home, '.dsh')
  const matches: string[] = []
  for await (const match of glob(`**/${sessionId}/session.jsonl.zstd`, { cwd: root })) matches.push(match)
  if (matches[0] === undefined) return ''
  const bytes = await readFile(join(root, matches[0]))
  const scan = scanZstdFrames(bytes)
  const chunks: Buffer[] = []
  for (const frame of scan.frames) chunks.push(await decompressZstdFrame(bytes.subarray(frame.start, frame.end)))
  return Buffer.concat(chunks).toString('utf8')
}

function synchronizedRuntime(): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure({
    routeId: parseRelayRouteId('route-snow-attachments'), endpoint: 'mobile',
    credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never, revision: 1,
  })
  runtime.markConnectionOpen()
  const resync = runtime.bindValidatedDesktopResync()
  if (resync === undefined || !resync.acceptValidatedDesktopResync({
    type: 'desktop-resync', version: 1, authenticated: true,
  })) throw new Error('attachment runtime did not synchronize')
  return runtime
}
