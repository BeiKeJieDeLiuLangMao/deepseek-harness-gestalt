import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type { ImAccountId } from '../../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  type InboundMessageRecord,
  encodeScopeId,
  encodeExternalMessageKey,
} from '../../src/delivery/index.ts'

interface TestMemoryStorageBackendInspection {
  units: Map<string, Map<string, Map<string, unknown>>>
}

interface TestDeliveryInternalTables {
  cursorsTable: {
    delete(key: unknown): Promise<void>
  }
  inboundTable: {
    put(key: unknown, value: unknown): Promise<void>
    update(key: unknown, updater: (prev: InboundMessageRecord) => InboundMessageRecord): Promise<InboundMessageRecord>
  }
  dedupTable: {
    put(key: unknown, value: unknown): Promise<void>
  }
}

describe('Crash-window recovery & cursor reconciliation RED', () => {
  let ctx: Context
  let backend: TestMemoryStorageBackend
  let configService: ImConfigService
  let deliveryService: ImDeliveryService

  beforeEach(async () => {
    backend = new TestMemoryStorageBackend()
    ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', backend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    await ctx.plugin(ImConfigService)
    configService = ctx.imConfig
    await ctx.plugin(ImDeliveryService)
    deliveryService = ctx.imDelivery
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('reconciles cursor and unsubmittedCount after crash in write window', async () => {
    const accountId = brandString<ImAccountId>('acc-crash-test')
    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Crash Test Account',
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-crash-1',
    }
    const scopeId = encodeScopeId(scope)

    // Message 1 normally processed
    await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-normal-1',
      senderClassification: 'external',
      senderEvidence: {},
      content: { text: 'msg 1' },
    })

    // Now simulate a crash window during message 2:
    // Suppose message 2 was written to message storage, but the process crashed before cursors table was updated.
    // We simulate this directly on backend storage unit:
    const backendInspection = backend as unknown as TestMemoryStorageBackendInspection
    const unitMap = backendInspection.units.get('im_delivery')
    expect(unitMap).toBeDefined()

    // Manually inject a message record into inbound_messages representing a message persisted before crash
    const crashedMsgKey = `${scopeId}::msg-crashed-2`
    unitMap?.get('inbound_messages')?.set(crashedMsgKey, {
      messageId: crashedMsgKey,
      scopeId,
      externalMessageId: 'msg-crashed-2',
      senderClassification: 'external',
      senderEvidence: {},
      stage: 'received',
      content: { text: 'crashed mid-write' },
      sequenceNumber: 2,
      receivedAt: new Date().toISOString(),
    })
    // Notice: cursorsTable is NOT updated (still has lastReceivedSequenceNumber = 1, unsubmittedCount = 1)

    // Now restart the service
    const restartCtx = new Context()
    await restartCtx.plugin(Storage)
    restartCtx.storage.backend.register('memory', backend)
    const restartFacility = new DomainFacility(restartCtx, { backend: 'memory', routes: {} })
    restartCtx.storage.mount('domain', restartFacility)
    restartCtx.provide('storageDomain', restartFacility)

    await restartCtx.plugin(ImConfigService)
    await restartCtx.plugin(ImDeliveryService)
    const restartedDelivery = restartCtx.imDelivery

    // When the external platform retries sending 'msg-crashed-2' or we query the cursor:
    // 1. Re-receiving 'msg-crashed-2' must be detected as duplicate
    const dupeRes = await restartedDelivery.receiveInbound({
      scope,
      externalMessageId: 'msg-crashed-2',
      senderClassification: 'external',
      senderEvidence: {},
      content: { text: 'crashed mid-write' },
    })
    expect(dupeRes.duplicate).toBe(true)

    // 2. The cursor MUST NOT lag behind! It must reflect sequenceNumber 2 and unsubmittedCount 2
    expect(dupeRes.cursor.lastReceivedSequenceNumber).toBe(2)
    expect(dupeRes.cursor.unsubmittedCount).toBe(2)

    const cursor = await restartedDelivery.getCursor(scopeId)
    expect(cursor?.lastReceivedSequenceNumber).toBe(2)
    expect(cursor?.unsubmittedCount).toBe(2)

    // Also test completely missing cursor in storage where inbound records DO exist, including submitted message
    const deliveryInspection = restartCtx.imDelivery as unknown as TestDeliveryInternalTables
    await deliveryInspection.inboundTable.update(crashedMsgKey, prev => ({
      ...prev,
      stage: 'submitted',
    }))
    await deliveryInspection.cursorsTable.delete(scopeId)

    const reDerivedCursor = await restartedDelivery.getCursor(scopeId)
    expect(reDerivedCursor).toBeDefined()
    expect(reDerivedCursor?.lastReceivedSequenceNumber).toBe(2)
    expect(reDerivedCursor?.lastSubmittedSequenceNumber).toBe(2)
    expect(reDerivedCursor?.unsubmittedCount).toBe(1) // message 1 was 'received'

    // Test a second message in same scope with lower sequenceNumber to cover branch 128 false
    const lowerSeqKey = `${scopeId}::msg-lower-0`
    await deliveryInspection.inboundTable.put(lowerSeqKey, {
      messageId: lowerSeqKey,
      scopeId,
      externalMessageId: 'msg-lower-0',
      senderClassification: 'external',
      senderEvidence: {},
      stage: 'received',
      content: { text: 'lower seq' },
      sequenceNumber: 1, // <= maxReceivedSeq (2)
      receivedAt: new Date().toISOString(),
    })
    await deliveryInspection.cursorsTable.delete(scopeId)
    const cursorWithLowerSeq = await restartedDelivery.getCursor(scopeId)
    expect(cursorWithLowerSeq?.lastReceivedSequenceNumber).toBe(2)

    // And test deduplication hit via secondary dedupTable when primary key isn't directly matched
    const specialKey = encodeExternalMessageKey(scopeId, 'special-dedup')
    await deliveryInspection.dedupTable.put(specialKey, {
      externalKey: specialKey,
      messageId: crashedMsgKey,
      scopeId,
      externalMessageId: 'special-dedup',
      recordedAt: new Date().toISOString(),
    })
    const specialDupe = await restartedDelivery.receiveInbound({
      scope,
      externalMessageId: 'special-dedup',
      senderClassification: 'external',
      senderEvidence: {},
      content: { text: 'secondary match' },
    })
    expect(specialDupe.duplicate).toBe(true)

    await restartCtx.fiber.dispose()
  })
})
