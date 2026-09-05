/** Companion Snow create-session against shipped `dsh web`. */

import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-runtime/client', async () => {
  const conversation = await import('../../../packages/client/runtime/src/client/sessions/conversation.ts')
  const { conversationContextKey } = await import(
    '../../../packages/client/ui-conversation/src/client/contract/conversation.ts',
  )
  class PendingWait {
    constructor(
      readonly kind: string,
      readonly interactionId: string,
      readonly sessionId: string,
      readonly payload: unknown,
      private readonly send: (message: { result: unknown }) => Promise<{ accepted: boolean }>,
    ) {}

    respond(result: unknown): Promise<{ accepted: boolean }> {
      return this.send({ result })
    }
  }
  return {
    EMPTY_CHAT_SNAPSHOT: conversation.EMPTY_CHAT_SNAPSHOT,
    EMPTY_CONVERSATION_VIEWS: conversation.EMPTY_CONVERSATION_VIEWS,
    PendingWait,
    conversationContextKey,
  }
})
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionCreateSessionOperation,
  type CompanionProjection,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import type { DesktopCompanionOperationOutput, DesktopCompanionPairingDependencies } from '../src/companion-product.ts'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSessionRequest,
  createDesktopHostWorkspace,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
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
import { MobileBrowse } from '../../mobile/src/MobileBrowse.tsx'
import { fixedMobilePresentationClock } from '../../mobile/src/mobile-clock.ts'
import {
  generateDesktopHostTypertArtifacts,
  startShippedWebHost,
  stopShippedWebHosts,
} from './shipped-web-host.ts'

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
  await disposeCreateFixtures()
})

/** Uninstall the Companion owner, then always stop the Host child. */
async function disposeCreateFixtures(): Promise<void> {
  try {
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  } finally {
    await stopShippedWebHosts(children, homes)
  }
}

describe('assembled Desktop Companion Host create on shipped dsh web', () => {
  it('creates Workspace-owned and Ungrouped Sessions from shipped Mobile buttons through Snow and the real Host', async () => {
    const first = await startShippedWebHost({ children, homes })
    try {
      installMobileDom()
      const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
      cleanups.push(async () => { cleanup() })
      const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
      const rpc = createDesktopHostRpc(first.running.url, {
        timeoutMs: 15_000,
        responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
        cookieHeader: cookie,
      })
      const workspaceRoot = join(first.home, 'Assembled Workspace')
      mkdirSync(workspaceRoot, { recursive: true })
      const created = await createDesktopHostWorkspace(rpc, workspaceRoot)
      expect(created.ok).toBe(true)
      if (!created.ok || !isRecord(created.value) || !isRecord(created.value.workspace)
        || typeof created.value.workspace.workspaceId !== 'string'
        || created.value.workspace.title !== 'Assembled Workspace') {
        throw new Error('Desktop Host workspace/create returned an invalid Workspace')
      }
      const workspaceId = created.value.workspace.workspaceId
      const attached = await createDesktopHostSessionRequest(rpc, { workspaceId })
      expect(attached).toMatchObject({ ok: true, value: { sessionId: expect.any(String) } })
      const owner = productOwner(first.running.url, cookie)
      const ledgerPath = join(first.home, 'companion-create-operations.json')
      owner.installLedger(await DesktopCompanionOperationLedger.load(
        new FileDesktopCompanionOperationStore(ledgerPath),
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
      const createOperations: CompanionCreateSessionOperation[] = []
      const received: CompanionResult[] = []
      const product = new MobileSnowCompanionProductChannel({
        runtime, connection,
        operationSettlement: assembledOperationSettlement('desktop-create'),
        installation: { authorizeCurrentInstallation: async () => ({
          accessToken: 'assembled-current-installation',
          proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
        }) },
        attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
        platformOrigin: 'https://operated-platform.test',
        trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
        sendCiphertext: async (_target, ciphertext) => {
          await Promise.resolve()
          const opened = channels.desktop.open(ciphertext)
          if (opened.type !== 'operation') throw new Error('assembled Desktop expected a Companion operation')
          if (opened.operation.type === 'create-session') createOperations.push(opened.operation)
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
        content: { loadImage: async (sessionId: string, attachment: never) => await product.loadImage(sessionId, attachment) },
      }
      const receiver = new MobileNoiseCompanionReceiver(
        channels.mobile, channels.generation, runtime,
        () => ({ acceptValidatedCompanionResult: (result) => {
          received.push(result)
          product.acceptResult(result)
          surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
        } }),
        () => surface.bindAuthenticatedConnection(connectionChannel),
        () => { surface.trackSurfaceRefresh(product.refreshSurface()) },
      )
      receiverRef.current = receiver
      receiver.receive(channels.desktop.seal({
        type: 'projection',
        projection: {
          type: 'foreground-sync', desktopName: 'Assembled Desktop',
          generation: channels.generation, desktopRevision: 1,
        },
      }))
      await expect.poll(() => surface.getSnapshot().workspaces.map(item => item.workspaceId))
        .toContain(workspaceId)

      render(createElement(AssembledMobileBrowse, { surface, runtime }))
      const initialIds = new Set(surface.getSnapshot().sessions.ids)
      fireEvent.click(within(screen.getByRole('region', { name: 'Assembled Workspace' }))
        .getByRole('button', { name: 'New Session in Assembled Workspace' }))
      await waitFor(() => { expect(createOperations).toHaveLength(1) })
      await waitFor(() => { expect(received).toHaveLength(1) })
      expect(received[0]).toMatchObject({ type: 'session-created' })
      await waitFor(() => { expect(surface.getSnapshot().sessions.ids).toHaveLength(initialIds.size + 1) })
      const workspaceSessionId = surface.getSnapshot().sessions.ids.find(id => !initialIds.has(id))
      if (workspaceSessionId === undefined) throw new Error('Workspace-owned Session was not projected')
      await screen.findByRole('heading', { name: workspaceSessionId })
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(within(screen.getByRole('region', { name: 'Assembled Workspace' }))
        .getByRole('treeitem', { name: 'New Session' }).getAttribute('data-session-row')).toBe(workspaceSessionId)

      fireEvent.click(screen.getByRole('button', { name: 'New ungrouped Session' }))
      await waitFor(() => { expect(surface.getSnapshot().sessions.ids).toHaveLength(initialIds.size + 2) })
      const ungroupedSessionId = surface.getSnapshot().sessions.ids.find(id => (
        !initialIds.has(id) && id !== workspaceSessionId
      ))
      if (ungroupedSessionId === undefined) throw new Error('Ungrouped Session was not projected')
      await screen.findByRole('heading', { name: ungroupedSessionId })
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(within(screen.getByRole('region', { name: 'Ungrouped' }))
        .getByRole('treeitem', { name: 'New Session' }).getAttribute('data-session-row')).toBe(ungroupedSessionId)

      expect(createOperations).toHaveLength(2)
      expect(createOperations[0]).toMatchObject({ type: 'create-session', workspaceId })
      expect(createOperations[1]).not.toHaveProperty('workspaceId')
      const restoredLedger = await DesktopCompanionOperationLedger.load(
        new FileDesktopCompanionOperationStore(ledgerPath),
      )
      for (const operation of createOperations) {
        await expect(restoredLedger.query(parsePersonalPairingId(channels.pairingSelector), operation.operationId))
          .resolves.toMatchObject({ type: 'session-created', operationId: operation.operationId })
        await expect(owner.queryOperationStatus(
          parsePersonalPairingId(channels.pairingSelector), operation.operationId,
        )).resolves.toMatchObject({
          type: 'status', operationId: operation.operationId,
          committed: { type: 'session-created', operationId: operation.operationId },
        })
      }
    } finally {
      await disposeCreateFixtures()
    }
  }, 180_000)
})

function assembledOperationSettlement(desktopId: string): CompanionUncertainOperationSettlement {
  return new CompanionUncertainOperationSettlement(
    new InMemoryCompanionCacheStore(),
    parseCompanionDesktopId(desktopId),
  )
}

function installMobileDom(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mobile.test' })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('navigator', dom.window.navigator)
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  vi.stubGlobal('Node', dom.window.Node)
  vi.stubGlobal('Event', dom.window.Event)
  vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver)
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  cleanups.push(async () => {
    dom.window.close()
    vi.unstubAllGlobals()
  })
}

function AssembledMobileBrowse({
  surface,
  runtime,
}: {
  surface: MobileCompanionSurface
  runtime: CompanionForegroundRuntime
}): ReactNode {
  const snapshot = useSyncExternalStore(
    listener => surface.subscribe(listener),
    () => surface.getSnapshot(),
  )
  const connection = useSyncExternalStore(
    listener => runtime.subscribe(listener),
    () => runtime.getState(),
  )
  if (snapshot.desktopName === undefined) return null
  return createElement(MobileBrowse, {
    desktopName: snapshot.desktopName,
    connection: connection.socketOpen && connection.synchronized ? 'online' : 'offline',
    sessions: snapshot.sessions,
    workspaces: snapshot.workspaces,
    conversations: snapshot.conversations,
    locale: 'en',
    theme: 'light',
    loadImage: surface.loadImage,
    canMutate: surface.mayMutate(),
    clock: fixedMobilePresentationClock(10_000),
    onCreate: surface.create,
    search: snapshot.search,
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
  expect(mobilePairing.exportAttachmentKey()).toEqual(attachmentKey)
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

function connectedRuntime(): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure({
    routeId: parseRelayRouteId('route-assembled-snow'), endpoint: 'mobile',
    credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never, revision: 1,
  })
  runtime.markConnectionOpen()
  return runtime
}

function pairingDependencies(
  owner: InstanceType<typeof DesktopCompanionProductOwner>,
  channels: Awaited<ReturnType<typeof snowProductChannels>>,
): DesktopCompanionPairingDependencies {
  const attachmentKey = channels.attachmentKey.slice()
  return {
    pairingId: parsePersonalPairingId(channels.pairingSelector),
    attachmentKey,
    now: Date.now,
    generation: channels.generation,
    desktopRevision: 1,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('v3 surface test does not download upload capabilities')),
    submitAttachment: () => Promise.reject(new Error('v3 surface test does not submit generic files')),
    resolveInteraction: interactionId => owner.resolveInteraction(interactionId, attachmentKey),
    pendingInteractions: sessionId => owner.pendingInteractions(sessionId, attachmentKey),
  }
}

function isProjection(value: CompanionProjection | CompanionResult): value is CompanionProjection {
  return value.type === 'foreground-sync' || value.type === 'transcript-page'
    || value.type === 'surface-snapshot' || value.type === 'conversation-snapshot'
}

function isResultList(value: DesktopCompanionOperationOutput): value is readonly CompanionResult[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
