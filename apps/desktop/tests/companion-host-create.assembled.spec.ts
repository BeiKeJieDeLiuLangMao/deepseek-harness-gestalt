/** Companion create-session against shipped `dsh web` generated Session remotes. */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  parseCompanionOperationId,
  parseCompanionWorkspaceId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionCreateSessionOperation,
  type CompanionResult,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  DesktopCompanionOperationLedger, FileDesktopCompanionOperationStore,
} from '../src/companion-operation-ledger.ts'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostWorkspace,
  listDesktopHostSessions,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import {
  generateDesktopHostTypertArtifacts,
  startShippedWebHost,
  stopShippedWebHosts,
} from './shipped-web-host.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
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
  } finally {
    await stopShippedWebHosts(children, homes)
  }
}

describe('assembled Desktop Companion Host create on shipped dsh web', () => {
  it('creates Workspace-owned and Ungrouped Sessions through the Companion owner and generated remotes', async () => {
    const first = await startShippedWebHost({ children, homes })
    try {
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
      const workspaceId = parseCompanionWorkspaceId(created.value.workspace.workspaceId)
      const owner = productOwner(first.running.url, cookie)
      const ledgerPath = join(first.home, 'companion-create-operations.json')
      owner.installLedger(await DesktopCompanionOperationLedger.load(
        new FileDesktopCompanionOperationStore(ledgerPath),
      ))
      const pairingId = parsePersonalPairingId('desktop-companion-create-pairing')
      const listedBefore = await listDesktopHostSessions(rpc)
      const initialIds = listedSessionIds(listedBefore)

      const workspaceCreate = createSessionOperation('assembled-create-workspace', workspaceId)
      const workspaceResult = await owner.handle(workspaceCreate, pairingDependencies(owner, pairingId))
      expect(workspaceResult).toMatchObject({
        type: 'session-created', operationId: workspaceCreate.operationId,
      })
      if (!isSessionCreated(workspaceResult)) throw new Error('Workspace-owned Session was not created')
      const workspaceSessionId = workspaceResult.sessionId

      const ungroupedCreate = createSessionOperation('assembled-create-ungrouped')
      const ungroupedResult = await owner.handle(ungroupedCreate, pairingDependencies(owner, pairingId))
      expect(ungroupedResult).toMatchObject({
        type: 'session-created', operationId: ungroupedCreate.operationId,
      })
      if (!isSessionCreated(ungroupedResult)) throw new Error('Ungrouped Session was not created')
      const ungroupedSessionId = ungroupedResult.sessionId
      expect(ungroupedSessionId).not.toBe(workspaceSessionId)

      const listed = await listDesktopHostSessions(rpc)
      const listedIds = listedSessionIds(listed)
      expect(listedIds).toEqual(expect.arrayContaining([
        ...initialIds, workspaceSessionId, ungroupedSessionId,
      ]))

      const restoredLedger = await DesktopCompanionOperationLedger.load(
        new FileDesktopCompanionOperationStore(ledgerPath),
      )
      for (const operation of [workspaceCreate, ungroupedCreate]) {
        await expect(restoredLedger.query(pairingId, operation.operationId))
          .resolves.toMatchObject({ type: 'session-created', operationId: operation.operationId })
        await expect(owner.queryOperationStatus(pairingId, operation.operationId)).resolves.toMatchObject({
          type: 'status', operationId: operation.operationId,
          committed: { type: 'session-created', operationId: operation.operationId },
        })
      }
    } finally {
      await disposeCreateFixtures()
    }
  }, 180_000)
})

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
  pairingId: ReturnType<typeof parsePersonalPairingId>,
): Parameters<InstanceType<typeof DesktopCompanionProductOwner>['handle']>[1] {
  const attachmentKey = new Uint8Array(32)
  return {
    pairingId,
    attachmentKey,
    now: Date.now,
    generation: 1,
    desktopRevision: 1,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('create must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('create must not submit an attachment')),
    resolveInteraction: interactionId => owner.resolveInteraction(interactionId, attachmentKey),
    pendingInteractions: sessionId => owner.pendingInteractions(sessionId, attachmentKey),
  }
}

function createSessionOperation(
  operationId: string,
  workspaceId?: ReturnType<typeof parseCompanionWorkspaceId>,
): CompanionCreateSessionOperation {
  return {
    type: 'create-session',
    operationId: parseCompanionOperationId(operationId),
    ...workspaceId === undefined ? {} : { workspaceId },
  }
}

function listedSessionIds(listed: Awaited<ReturnType<typeof listDesktopHostSessions>>): string[] {
  if (!listed.ok || !isRecord(listed.value) || !Array.isArray(listed.value.items)) {
    throw new Error('Desktop Host session/list returned an invalid value')
  }
  return listed.value.items.flatMap((item) => {
    return isRecord(item) && typeof item.sessionId === 'string' ? [item.sessionId] : []
  })
}

function isSessionCreated(value: unknown): value is Extract<CompanionResult, { type: 'session-created' }> {
  return isRecord(value) && value.type === 'session-created' && typeof value.sessionId === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
