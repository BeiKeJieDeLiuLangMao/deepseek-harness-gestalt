import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval/types'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { FixtureTransportClosedError, launchCompanionFixture } from './companion-fixture/driver.ts'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  generateRelayCredential,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseRelayAttachmentId,
  parseRelayPairingSelector,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionOperationFailedResult,
  type CompanionCreateSessionOperation,
  type CompanionSearchSessionsOperation,
  type CompanionSessionSearchResult,
  type CompanionProjection,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  acceptSnowDesktopReconnect, beginSnowCompanionProtocol, beginSnowMobileReconnect, initializeSnowChannel,
  SnowDesktopEndpointPairingOwner, SnowMobileHandshakeClient,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import { DesktopCompanionProductOwner } from '#testing/desktop/companion-product'
import type { DesktopCompanionOperationOutput, DesktopCompanionPairingDependencies } from '#testing/desktop/companion-product'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '#testing/desktop/companion-operation-ledger'
import { CompanionForegroundRuntime } from '#testing/mobile/companion-lifecycle'
import {
  CompanionUncertainOperationSettlement,
  InMemoryCompanionCacheStore,
  parseCompanionDesktopId,
} from '#testing/mobile/companion-cache'
import { MobileCompanionSurface } from '#testing/mobile/companion-surface'
import {
  MobileSnowCompanionConnection, MobileSnowCompanionProductChannel,
} from '#testing/mobile/noise-companion-product'
import { MobileNoiseCompanionReceiver } from '#testing/mobile/noise-companion'
import { MobileBrowse } from '#testing/mobile/MobileBrowse'
import { fixedMobilePresentationClock } from '#testing/mobile/mobile-clock'
import { DesktopSnowRelayChannelOwner } from '#testing/desktop/remote-relay'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('assembled Desktop Companion Host search', () => {
  it('rejects pending fixture commands when the Host process exits before readiness', async () => {
    const fixture = launchCompanionFixture(new URL('./companion-fixture/missing-host.ts', import.meta.url))
    cleanups.push(fixture.dispose)
    await expect(fixture.request({ type: 'start', scenario: 'indexed', message: 'unreachable', enableCreation: false }))
      .rejects.toBeInstanceOf(FixtureTransportClosedError)
    await expect(fixture.dispose()).resolves.toBeUndefined()
  }, 10_000)

  it('creates Workspace-owned and Ungrouped Sessions from shipped Mobile buttons through Snow and the real Host', async () => {
    installMobileDom()
    const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
    cleanups.push(async () => { cleanup() })
    const assembled = await startDesktopHost('indexed', 'assembled create baseline', true)
    const workspace = await assembled.request({ type: 'workspace-create', root: assembled.root, name: 'Assembled Workspace' })
    await assembled.request({ type: 'workspace-attach', workspaceId: workspace.id, sessionId: assembled.sessionId })
    const owner = productOwner(assembled.url)
    const ledgerPath = join(assembled.root, 'companion-create-operations.json')
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
        if (opened.operation.type === 'query-operation-status') throw new Error('assembled product transport expected a product operation')
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
      content: { loadImage: async (sessionId: SessionId, attachment: Parameters<MobileSnowCompanionProductChannel['loadImage']>[1]) => await product.loadImage(sessionId, attachment) },
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
      .toContain(workspace.id)

    render(createElement(AssembledMobileBrowse, { surface, runtime }))
    const initialIds = new Set(surface.getSnapshot().sessions.ids)
    fireEvent.click(within(screen.getByRole('region', { name: 'Assembled Workspace' }))
      .getByRole('button', { name: 'New Session in Assembled Workspace' }))
    await waitFor(() => { expect(createOperations).toHaveLength(1) })
    await waitFor(() => { expect(received).toHaveLength(1) })
    const workspaceCreated = received[0]
    if (workspaceCreated?.type !== 'session-created') throw new Error('Workspace Session creation returned no result')
    await waitFor(() => { expect(surface.getSnapshot().sessions.ids).toHaveLength(initialIds.size + 1) })
    const workspaceSessionId = SessionId(workspaceCreated.sessionId)
    expect(surface.getSnapshot().sessions.ids).toContain(workspaceSessionId)
    await screen.findByRole('heading', { name: workspaceSessionId })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(within(screen.getByRole('region', { name: 'Assembled Workspace' }))
      .getByRole('treeitem', { name: 'New Session' }).getAttribute('data-session-row')).toBe(workspaceSessionId)

    fireEvent.click(screen.getByRole('button', { name: 'New ungrouped Session' }))
    await waitFor(() => { expect(received).toHaveLength(2) })
    const ungroupedCreated = received[1]
    if (ungroupedCreated?.type !== 'session-created') throw new Error('Ungrouped Session creation returned no result')
    await waitFor(() => { expect(surface.getSnapshot().sessions.ids).toHaveLength(initialIds.size + 2) })
    const ungroupedSessionId = SessionId(ungroupedCreated.sessionId)
    expect(surface.getSnapshot().sessions.ids).toContain(ungroupedSessionId)
    await screen.findByRole('heading', { name: ungroupedSessionId })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(within(screen.getByRole('region', { name: 'Ungrouped' }))
      .getByRole('treeitem', { name: 'New Session' }).getAttribute('data-session-row')).toBe(ungroupedSessionId)

    expect(createOperations).toHaveLength(2)
    expect(createOperations[0]).toMatchObject({ type: 'create-session', workspaceId: workspace.id })
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
  }, 45_000)

  it('projects real Session history and runs submit, cancel, and image bytes through Snow into shared Mobile state', async () => {
    const assembled = await startDesktopHost('indexed', 'assembled v3 history')
    for (const method of ['session.list', 'workspace.list'] as const) {
      const response = await fetch(new URL(`/api/${method}`, assembled.url), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: `probe-${method}`, method, payload: {} }),
      })
      expect(response.status, await response.text()).toBe(200)
    }
    const owner = productOwner(assembled.url)
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(assembled.root, 'companion-operations.json')),
    ))
    const channels = await snowProductChannels()
    const disposeLive = owner.connectLiveProjection(
      parsePersonalPairingId(channels.pairingSelector), () => {}, () => {},
    )
    cleanups.push(async () => { disposeLive() })
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const surface = new MobileCompanionSurface(runtime)
    const received: CompanionResult[] = []
    const transportFailures: unknown[] = []
    const receiverRef: { current?: MobileNoiseCompanionReceiver } = {}
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-primary'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      reportFailure: (error) => { transportFailures.push(error) },
      sendCiphertext: async (_target, ciphertext) => {
        await Promise.resolve()
        const opened = channels.desktop.open(ciphertext)
        if (opened.type !== 'operation') throw new Error('assembled Desktop expected a Companion operation')
        if (opened.operation.type === 'query-operation-status') throw new Error('assembled product transport expected a product operation')
        const output = await owner.handle(opened.operation, pairingDependencies(owner, channels))
        for (const item of isResultList(output) ? output : [output]) {
          const receiver = receiverRef.current
          if (receiver === undefined) throw new Error('assembled Mobile receiver is not installed')
          receiver.receive(channels.desktop.seal(isProjection(item)
            ? { type: 'projection', projection: item }
            : { type: 'result', result: item }))
        }
      },
    })
    const connectionChannel = {
      mutations: product,
      content: { loadImage: async (sessionId: SessionId, attachment: Parameters<MobileSnowCompanionProductChannel['loadImage']>[1]) => await product.loadImage(sessionId, attachment) },
    }
    const receiver = new MobileNoiseCompanionReceiver(
      channels.mobile, channels.generation, runtime,
      () => ({
        acceptValidatedCompanionResult: (result) => {
          received.push(result)
          product.acceptResult(result)
          surface.bindValidatedCompanionResults()?.acceptValidatedCompanionResult(result)
        },
      }),
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
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(assembled.sessionId)).toBe(true)
    expect(received.filter(result => result.type === 'operation-failed')).toEqual([])
    surface.loadOlder(assembled.sessionId)
    await expect.poll(() => ({
      ready: (surface.getSnapshot().conversations[assembled.sessionId]?.nodes.length ?? 0) > 0,
      failures: received.filter(result => result.type === 'operation-failed'),
      transportFailures,
    })).toEqual({ ready: true, failures: [], transportFailures: [] })

    await surface.submit(assembled.sessionId, 'submitted through Companion v3')
    await expect.poll(async () => (await assembled.request({ type: 'events', id: assembled.sessionId })).some(event => event.type === 'user/message'
      && JSON.stringify(event.data).includes('submitted through Companion v3'))).toBe(true)
    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'turn/start', data: { turn: 1 } })
    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'step/start', data: { turn: 1, step: 1 } })
    surface.cancel(assembled.sessionId)
    await expect.poll(() => assembled.request({ type: 'cancelled' })).toBe(1)
    await assembled.request({
      type: 'finish-cancelled-response', id: assembled.sessionId, turn: 1, step: 1,
      text: 'Cancelled Companion prefix',
    })
    surface.trackHistoryRefresh(assembled.sessionId, product.loadOlder(assembled.sessionId))
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId]?.nodes
      .find(node => node.kind === 'assistant')).toMatchObject({
      kind: 'assistant', interrupted: true,
      blocks: [{ kind: 'text', text: 'Cancelled Companion prefix' }],
    })

    const resultCount = received.length
    const image = surface.loadImage(assembled.sessionId, assembled.image)
    await expect.poll(() => received.slice(resultCount).some(result => result.type === 'image-chunk')).toBe(true)
    await expect(image).resolves.toMatch(/^data:image\/png;base64,/u)

    const questionToken = await assembled.request({ type: 'question' })
    const asked = assembled.request({ type: 'settlement', token: questionToken })
    await expect.poll(() => owner.pendingInteractions(parseCompanionSessionId(assembled.sessionId), channels.attachmentKey)
      .some(pending => typeof pending === 'object' && pending !== null && 'kind' in pending
        && pending.kind === 'question')).toBe(true)
    surface.loadOlder(assembled.sessionId)
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId]?.pending
      .some(pending => pending.kind === 'question') ?? false).toBe(true)
    const question = surface.getSnapshot().conversations[assembled.sessionId]?.pending
      .find(pending => pending.kind === 'question')
    if (question === undefined || question.kind !== 'question') throw new Error('assembled Ask User wait was not projected')
    await expect(question.respond({
      ok: true,
      value: { sessionId: assembled.sessionId, answer: { answers: [{ id: 'target', selected: ['Code'] }] } },
    })).resolves.toEqual({ accepted: true })
    await expect(asked).resolves.toEqual({ answers: [{ id: 'target', selected: ['Code'] }] })

    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'turn/start', data: { turn: 1 } })
    const approvalToken = await assembled.request({ type: 'approval' })
    const approval = assembled.request({ type: 'settlement', token: approvalToken })
    let hostApprovalId: ApprovalRequestId | undefined
    await expect.poll(() => {
      hostApprovalId = findPendingApprovalId(owner.pendingInteractions(
        parseCompanionSessionId(assembled.sessionId), channels.attachmentKey,
      ))
      return hostApprovalId !== undefined
    }).toBe(true)
    surface.loadOlder(assembled.sessionId)
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId]?.pending
      .some(pending => pending.kind === 'approval') ?? false).toBe(true)
    const approvalWait = surface.getSnapshot().conversations[assembled.sessionId]?.pending
      .find(pending => pending.kind === 'approval')
    if (approvalWait === undefined || approvalWait.kind !== 'approval') throw new Error('assembled Approval wait was not projected')
    if (hostApprovalId === undefined) throw new Error('assembled Host Approval wait was not projected')
    const mobileApprovalId = findPendingApprovalId([approvalWait])
    if (mobileApprovalId === undefined) throw new Error('assembled Mobile Approval id was not projected')
    expect(mobileApprovalId).toBe(hostApprovalId)
    await expect(approvalWait.respond({
      ok: true,
      value: {
        sessionId: assembled.sessionId,
        approvalId: mobileApprovalId,
        outcome: 'allowed-once',
      },
    })).resolves.toEqual({ accepted: true })
    await expect(approval).resolves.toBe('allowed-once')
  }, 45_000)

  it('pushes committed Host output and hidden Session summaries through the authenticated Snow owner', async () => {
    const assembled = await startDesktopHost('indexed', 'live projection baseline')
    const baselineSessionIds = [assembled.sessionId]
    for (let index = 0; index < REMOTE_PROTOCOL_LIMITS.surfaceSessionRows; index += 1) {
      const sessionId = SessionId(`desktop-paged-session-${String(index)}`)
      await assembled.request({ type: 'create-session', id: sessionId, createdAt: index + 2, cwd: assembled.root })
      baselineSessionIds.push(sessionId)
    }
    const owner = productOwner(assembled.url)
    const channels = await snowProductChannels()
    const runtime = connectedRuntime()
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channels.mobile, targetAttachmentId: channels.desktopAttachmentId,
      pairingSelector: channels.pairingSelector, generation: channels.generation,
    })
    const surface = new MobileCompanionSurface(runtime)
    const operationTypes: string[] = []
    const reconnectFailures: Error[] = []
    let sends = 0
    const relayOwner = new DesktopSnowRelayChannelOwner({ accept: async () => ({
      targetAttachmentId: channels.mobileAttachmentId,
      payload: Uint8Array.of(77),
      negotiation: { finish: () => channels.desktop, cancel: vi.fn() },
      pairingSelector: channels.pairingSelector,
      generation: channels.generation,
    }) }, async (_selector, _target, ciphertext) => {
      sends += 1
      if (sends === 1) return
      setTimeout(() => { receiver.receive(ciphertext) }, 0)
    }, async (operation) => {
      operationTypes.push(operation.type)
      if (operation.type === 'query-operation-status') {
        return await owner.queryOperationStatus(
          parsePersonalPairingId(channels.pairingSelector), operation.operationId,
        )
      }
      return await owner.handle(operation, pairingDependencies(owner, channels))
    }, () => 'Assembled Desktop', 10_000, {
      connect: (selector, changed, disconnect) => owner.connectLiveProjection(
        parsePersonalPairingId(selector), changed, disconnect,
      ),
      project: async (change, _selector, signal) => await owner.projectLiveSession(
        change, channels.attachmentKey, signal,
      ),
      retainsConversation: (change, selector) => owner.retainsLiveConversation(
        parsePersonalPairingId(selector), change,
      ),
      reconnect: (_selector, error) => { reconnectFailures.push(error) },
    })
    const product = new MobileSnowCompanionProductChannel({
      runtime, connection,
      operationSettlement: assembledOperationSettlement('desktop-live'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channels.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      sendCiphertext: async (_target, ciphertext) => {
        await relayOwner.receive(
          ciphertext, channels.mobileAttachmentId, channels.desktopAttachmentId,
          channels.pairingSelector, new AbortController().signal,
        )
      },
      trackHistoryRefresh: (sessionId, submission) => { surface.trackHistoryRefresh(sessionId, submission) },
      trackSurfaceRefresh: (submission) => { surface.trackSurfaceRefresh(submission) },
    })
    const connectionChannel = {
      mutations: product,
      content: { loadImage: async (sessionId: SessionId, attachment: Parameters<MobileSnowCompanionProductChannel['loadImage']>[1]) => await product.loadImage(sessionId, attachment) },
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
    relayOwner.updatePeers({
      type: 'ready', transportVersion: 1,
      routeId: parseRelayRouteId('route-assembled-snow'),
      attachmentId: channels.desktopAttachmentId,
      peers: [{
        attachmentId: channels.mobileAttachmentId,
        pairingSelector: channels.pairingSelector,
        generation: channels.generation,
      }],
    }, channels.pairingSelector)
    await relayOwner.receive(
      Uint8Array.of(1), channels.mobileAttachmentId, channels.desktopAttachmentId,
      channels.pairingSelector, new AbortController().signal,
    )
    await relayOwner.receive(
      Uint8Array.of(2), channels.mobileAttachmentId, channels.desktopAttachmentId,
      channels.pairingSelector, new AbortController().signal,
    )
    await expect.poll(() => baselineSessionIds.every(id => surface.getSnapshot().sessions.ids.includes(id))).toBe(true)
    expect(surface.getSnapshot().sessions.ids).toHaveLength(REMOTE_PROTOCOL_LIMITS.surfaceSessionRows + 1)
    const observation = product.observeSession(assembled.sessionId)
    await expect(observation.completion).resolves.toBeUndefined()
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId] !== undefined).toBe(true)
    const historyOperations = operationTypes.filter(type => type === 'load-history').length

    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'turn/start', data: { turn: 1 } })
    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'step/start', data: { turn: 1, step: 1 } })
    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'assistant/chunk', data: {
      turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' },
    } })
    await assembled.request({ type: 'append', id: assembled.sessionId, event: 'assistant/chunk', data: {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'LIVE_PUSH_OK' },
    } })
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId]?.partial)
      .toMatchObject({ blocks: [{ kind: 'text', text: 'LIVE_PUSH_OK' }] })
    expect(operationTypes.filter(type => type === 'load-history')).toHaveLength(historyOperations)

    const hiddenId = SessionId('desktop-hidden-session')
    await assembled.request({ type: 'create-session', id: hiddenId, createdAt: 2, cwd: assembled.root })
    await assembled.request({ type: 'message', id: hiddenId, text: 'hidden summary change' })
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(hiddenId)).toBe(true)
    expect(surface.getSnapshot().conversations[hiddenId]).toBeUndefined()

    const secondaryRoot = join(assembled.root, 'secondary')
    await mkdir(secondaryRoot)
    const surfaceOperations = operationTypes.filter(type => type === 'refresh-surface').length
    const secondaryWorkspace = await assembled.request({ type: 'workspace-create', root: secondaryRoot, name: 'Secondary' })
    await expect.poll(() => operationTypes.filter(type => type === 'refresh-surface').length)
      .toBeGreaterThan(surfaceOperations)
    expect(surface.getSnapshot().conversations[assembled.sessionId]?.partial)
      .toMatchObject({ blocks: [{ kind: 'text', text: 'LIVE_PUSH_OK' }] })
    await assembled.request({
      type: 'finish-cancelled-response', id: assembled.sessionId, turn: 1, step: 1,
      text: 'LIVE_PUSH_OK',
    })
    await expect.poll(() => surface.getSnapshot().conversations[assembled.sessionId]?.nodes
      .find(node => node.kind === 'assistant')).toMatchObject({
      kind: 'assistant', interrupted: true,
      blocks: [{ kind: 'text', text: 'LIVE_PUSH_OK' }],
    })
    expect(surface.getSnapshot().conversations[assembled.sessionId]?.partial).toBeNull()
    expect(operationTypes.filter(type => type === 'load-history')).toHaveLength(historyOperations)
    const secondaryId = SessionId('desktop-secondary-workspace-session')
    await assembled.request({ type: 'create-session', id: secondaryId, createdAt: 100, cwd: secondaryRoot })
    await assembled.request({ type: 'workspace-attach', workspaceId: secondaryWorkspace.id, sessionId: secondaryId })
    const primaryWorkspace = await assembled.request({ type: 'workspace-create', root: assembled.root, name: 'Primary' })
    await assembled.request({ type: 'workspace-attach', workspaceId: primaryWorkspace.id, sessionId: assembled.sessionId })
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual([primaryWorkspace.id, secondaryWorkspace.id])
    await assembled.request({ type: 'workspace-reorder', workspaceId: primaryWorkspace.id })
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual([secondaryWorkspace.id, primaryWorkspace.id])
    await assembled.request({ type: 'workspace-delete', workspaceId: secondaryWorkspace.id })
    await expect.poll(() => surface.getSnapshot().workspaces.map(workspace => workspace.workspaceId))
      .toEqual([primaryWorkspace.id])
    await assembled.request({ type: 'archive', sessionId: assembled.sessionId })
    await expect.poll(() => surface.getSnapshot().sessions.ids.includes(assembled.sessionId)).toBe(false)
    expect(surface.getSnapshot().conversations[assembled.sessionId]).toBeUndefined()
    expect(reconnectFailures).toEqual([])
    relayOwner.invalidate(channels.pairingSelector)
    await relayOwner.drain()
  }, 45_000)

  it('runs shipped Mobile mutations through Snow into the real Desktop Host', async () => {
    const assembled = await startDesktopHost('indexed', 'assembled Snow search needle')
    const owner = productOwner(assembled.url)
    owner.installLedger(await DesktopCompanionOperationLedger.load(
      new FileDesktopCompanionOperationStore(join(assembled.root, 'legacy-product-operations.json')),
    ))
    const channel = await snowProductChannels()
    const runtime = synchronizedRuntime(channel.mobile, channel.desktop, channel.generation)
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channel.mobile,
      targetAttachmentId: channel.desktopAttachmentId,
      pairingSelector: channel.pairingSelector,
      generation: channel.generation,
    })
    let retainedCiphertext = new Uint8Array()
    const results: unknown[] = []
    const productRef: { current?: MobileSnowCompanionProductChannel } = {}
    const receiver = new MobileNoiseCompanionReceiver(
      channel.mobile, channel.generation, runtime,
      () => ({ acceptValidatedCompanionResult: (result) => {
        results.push(result)
        productRef.current?.acceptResult(result)
      } }),
    )
    const product = new MobileSnowCompanionProductChannel({
      runtime,
      connection,
      operationSettlement: assembledOperationSettlement('desktop-shipped'),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channel.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      sendCiphertext: async (_target, ciphertext) => {
        const opened = channel.desktop.open(ciphertext)
        if (opened.type !== 'operation') throw new Error('assembled Desktop did not open a Companion operation')
        if (opened.operation.type === 'query-operation-status') throw new Error('assembled product transport expected a product operation')
        const output = await owner.handle(opened.operation, {
          pairingId: parsePersonalPairingId('pairing-assembled-snow'),
          attachmentKey: channel.attachmentKey.slice(),
          now: Date.now,
          generation: channel.generation,
          desktopRevision: 1,
          desktopName: 'Assembled Desktop',
          downloadAttachment: async () => retainedCiphertext.slice(),
          submitAttachment: async input => await owner.submitAttachment(input),
          resolveInteraction: interactionId => owner.resolveInteraction(interactionId, channel.attachmentKey),
          pendingInteractions: sessionId => owner.pendingInteractions(sessionId, channel.attachmentKey),
        })
        if (isResultList(output) || isProjection(output)) throw new Error('legacy assembled operation returned non-result output')
        receiver.receive(channel.desktop.seal({ type: 'result', result: output }))
      },
    })
    productRef.current = product
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_input, init) => {
      retainedCiphertext = new Uint8Array(await new Response(init?.body).arrayBuffer())
      return new Response(JSON.stringify({
        capability: 'A'.repeat(43), byteLength: retainedCiphertext.byteLength,
        expiresAt: Date.now() + 60_000,
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }
    try {
      const search = product.search('assembled Snow search needle')
      await search.completion
      await expect.poll(() => results.some(result => isOperationResult(result, search.operationId))).toBe(true)
      for (const [name, type, bytes] of [
        ['payload.bin', 'application/octet-stream', Uint8Array.of(0, 255, 1, 2)],
        ['pixel.png', 'image/png', Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
        ['notes.txt', 'text/plain', new TextEncoder().encode('assembled exact text bytes')],
      ] as const) {
        const transfer = product.attach(assembled.sessionId, new File([bytes], name, { type }))
        await transfer.completion
        await expect.poll(() => results.some(result => isOperationResult(result, transfer.operationId))).toBe(true)
      }
      expect(results.map(result => typeof result === 'object' && result !== null && 'type' in result
        ? result.type
        : 'invalid')).toEqual(['session-search', 'confirmed', 'confirmed', 'confirmed'])
      const admitted = (await assembled.request({ type: 'events', id: assembled.sessionId })).filter(event => event.type === 'session/attachment-admitted')
      expect(admitted.map(event => event.type === 'session/attachment-admitted'
        ? [event.data.attachment.name, event.data.attachment.mediaType, event.data.attachment.bytes]
        : [])).toEqual([
        ['payload.bin', 'application/octet-stream', 4],
        ['pixel.png', 'image/png', 8],
        ['notes.txt', 'text/plain', 26],
      ])
    } finally {
      globalThis.fetch = originalFetch
      channel.attachmentKey.fill(0)
      channel.mobile.dispose()
      channel.desktop.dispose()
    }
  }, 45_000)

  it('retains the Snow send nonce when the durable operation fence fails', async () => {
    const channel = await snowProductChannels()
    const runtime = synchronizedRuntime(channel.mobile, channel.desktop, channel.generation)
    const connection = new MobileSnowCompanionConnection()
    connection.connect({
      channel: channel.mobile,
      targetAttachmentId: channel.desktopAttachmentId,
      pairingSelector: channel.pairingSelector,
      generation: channel.generation,
    })
    const store = new InMemoryCompanionCacheStore()
    vi.spyOn(store, 'saveReceipt').mockRejectedValueOnce(new Error('durable fence failed'))
    const opened: Array<'operation'> = []
    const product = new MobileSnowCompanionProductChannel({
      runtime,
      connection,
      operationSettlement: new CompanionUncertainOperationSettlement(
        store,
        parseCompanionDesktopId('desktop-fence-nonce'),
      ),
      installation: { authorizeCurrentInstallation: async () => ({
        accessToken: 'assembled-current-installation',
        proof: { jti: 'assembled-proof' as never, issuedAt: 1, signature: 'assembled-signature' },
      }) },
      attachmentKeys: { attachmentKeyMaterial: () => channel.attachmentKey.slice() },
      platformOrigin: 'https://operated-platform.test',
      sendCiphertext: async (_target, ciphertext) => {
        const message = channel.desktop.open(ciphertext)
        if (message.type !== 'operation') throw new Error('assembled Desktop expected an operation')
        opened.push(message.type)
      },
    })
    try {
      await expect(product.submit(assembledSessionId(), 'fenced prompt').completion)
        .rejects.toThrow('durable fence failed')
      await expect(product.search('nonce remains synchronized').completion).resolves.toBeUndefined()
      expect(opened).toEqual(['operation'])
    } finally {
      channel.attachmentKey.fill(0)
      channel.mobile.dispose()
      channel.desktop.dispose()
    }
  })

  it('indexes a real Desktop Session and returns authoritative hit and no-hit results', async () => {
    const assembled = await startDesktopHost('indexed', 'desktop assembled SQLite needle')
    const owner = productOwner(assembled.url)

    let hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
    await expect.poll(async () => {
      hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
      return hit.type === 'session-search'
        && hit.items.some(item => item.sessionId === parseCompanionSessionId(assembled.sessionId) && item.snippet.includes('SQLite needle'))
    }, { timeout: 15_000 }).toBe(true)
    expect(hit).toMatchObject({
      type: 'session-search',
      hasMore: false,
    })
    await expect(search(owner, 'definitely absent companion phrase', 'assembled-no-hit')).resolves.toEqual({
      type: 'session-search',
      operationId: parseCompanionOperationId('assembled-no-hit'),
      items: [],
      hasMore: false,
    })
  }, 45_000)

  it('encodes a real Host HTTP 400 as one Companion result', async () => {
    await expect(runHost400CodecProbe()).resolves.toBeInstanceOf(Uint8Array)
  })

  it.each(['disabled', 'index-failure'] as const)(
    'projects a real Desktop %s search-provider failure',
    async (scenario) => {
      const assembled = await startDesktopHost(scenario, `desktop ${scenario} needle`)
      const owner = productOwner(assembled.url)

      const failure = await search(owner, `desktop ${scenario} needle`, `assembled-${scenario}`)
      expect(failure).toMatchObject({
        type: 'operation-failed',
        operationId: parseCompanionOperationId(`assembled-${scenario}`),
        failure: {
          kind: 'business',
          code: 'internal',
        },
      })
      if (failure.type !== 'operation-failed') throw new Error('expected search failure')
      expect(failure.failure.message).toContain('session search failed')
    },
    45_000,
  )
})

function assembledOperationSettlement(desktopId: string): CompanionUncertainOperationSettlement {
  return new CompanionUncertainOperationSettlement(
    new InMemoryCompanionCacheStore(),
    parseCompanionDesktopId(desktopId),
  )
}

function assembledSessionId(): SessionId {
  return 'session-fence-nonce' as SessionId
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
    onOpenAccount: () => { throw new Error('assembled browse scenario does not open Account') },
    search: snapshot.search,
  })
}

async function startDesktopHost(
  scenario: 'indexed' | 'disabled' | 'index-failure', message: string, enableCreation = false,
) {
  const fixture = launchCompanionFixture()
  cleanups.push(fixture.dispose)
  const ready = await fixture.request({ type: 'start', scenario, message, enableCreation })
  return { ...ready, request: fixture.request }
}

async function runHost400CodecProbe(): Promise<Uint8Array> {
  const fixture = launchCompanionFixture()
  cleanups.push(fixture.dispose)
  return await fixture.request({ type: 'codec' })
}

function findPendingApprovalId(pendingInteractions: readonly unknown[]): ApprovalRequestId | undefined {
  for (const pending of pendingInteractions) {
    if (typeof pending === 'object' && pending !== null && 'kind' in pending && pending.kind === 'approval'
      && 'payload' in pending && typeof pending.payload === 'object' && pending.payload !== null
      && 'approvalId' in pending.payload && typeof pending.payload.approvalId === 'string') {
      return ApprovalRequestId(pending.payload.approvalId)
    }
  }
  return undefined
}

function productOwner(baseUrl: string): DesktopCompanionProductOwner {
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 10_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    attachmentTimeoutMs: 120_000,
  })
  const uninstall = owner.installHost(baseUrl)
  cleanups.push(async () => { uninstall() })
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

function synchronizedRuntime(
  mobile: SnowCompanionProtocolChannel,
  desktop: SnowCompanionProtocolChannel,
  generation: number,
): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure({
    routeId: parseRelayRouteId('route-assembled-snow'), endpoint: 'mobile',
    credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never, revision: 1,
  })
  runtime.markConnectionOpen()
  const receiver = new MobileNoiseCompanionReceiver(mobile, generation, runtime)
  receiver.receive(desktop.seal({
    type: 'projection',
    projection: { type: 'foreground-sync', desktopName: 'Assembled Desktop', generation, desktopRevision: 1 },
  }))
  return runtime
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
  owner: DesktopCompanionProductOwner,
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

function isOperationResult(value: unknown, operationId: unknown): boolean {
  return typeof value === 'object' && value !== null && 'operationId' in value
    && value.operationId === operationId
}

async function search(
  owner: DesktopCompanionProductOwner,
  query: string,
  operationId: string,
): Promise<CompanionSessionSearchResult | CompanionOperationFailedResult> {
  const operation: CompanionSearchSessionsOperation = {
    type: 'search-sessions',
    operationId: parseCompanionOperationId(operationId),
    query,
  }
  const output = await owner.handle(operation, {
    pairingId: parsePersonalPairingId('desktop-companion-assembled-pairing'),
    attachmentKey: new Uint8Array(32),
    now: Date.now,
    generation: 1,
    desktopRevision: 1,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('search must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('search must not submit an attachment')),
    resolveInteraction: () => undefined,
    pendingInteractions: () => [],
  })
  if (isResultList(output) || isProjection(output)
    || (output.type !== 'session-search' && output.type !== 'operation-failed')) {
    throw new Error('assembled search returned an invalid output kind')
  }
  return output
}
