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
  encodeScopeId,
  unescapeScopeComponent,
} from '../../src/delivery/index.ts'

describe('ImDeliveryService - Inbound Delivery & Deduplication', () => {
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

  it('Requirement 1: inbound same externalid duplicate handling & write-first progress', async () => {
    const accountId = brandString<ImAccountId>('acc-real-1')
    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Real DingTalk Account',
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-100',
    }
    const scopeId = encodeScopeId(scope)
    expect(scopeId).toBeDefined()

    // First receive of external message msg-ext-001
    const res1 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-ext-001',
      senderClassification: 'external',
      senderEvidence: {
        rawSenderId: 'user-bob',
        rawSenderNick: 'Bob',
        clientSource: 'external',
      },
      content: { text: 'Hello from Bob' },
    })

    expect(res1.duplicate).toBe(false)
    expect(res1.message.stage).toBe('received')
    expect(res1.message.sequenceNumber).toBe(1)
    expect(res1.cursor.lastReceivedSequenceNumber).toBe(1)
    expect(res1.cursor.lastSubmittedSequenceNumber).toBe(0)
    expect(res1.cursor.unsubmittedCount).toBe(1)

    // Second receive with SAME externalMessageId in same scope
    const res2 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-ext-001',
      senderClassification: 'external',
      senderEvidence: {
        rawSenderId: 'user-bob',
        rawSenderNick: 'Bob',
        clientSource: 'external',
      },
      content: { text: 'Hello from Bob duplicate' },
    })

    expect(res2.duplicate).toBe(true)
    expect(res2.message.messageId).toBe(res1.message.messageId)
    expect(res2.message.content.text).toBe('Hello from Bob') // preserved original content
    expect(res2.cursor.lastReceivedSequenceNumber).toBe(1)
    expect(res2.cursor.unsubmittedCount).toBe(1)

    // Verify colon safety: encodeScopeId prevents delimiter collision
    const trickyScope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId: brandString<ImAccountId>('acc:tricky'),
      conversationId: 'conv:colons:nested',
    }
    const trickyScopeId = encodeScopeId(trickyScope)
    expect(trickyScopeId).toContain('%3A')
    expect(trickyScopeId).not.toBe('real:dingtalk:acc:tricky:conv:colons:nested')
    expect(unescapeScopeComponent('test%3Avalue%25done')).toBe('test:value%done')
  })

  it('Requirement 4: strict isolation between real and sim scopes', async () => {
    const accountId = brandString<ImAccountId>('acc-real-4')
    const realScope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'target-conv-1',
    }
    const simScope1: ImDeliveryScope = {
      kind: 'sim',
      instanceId: 'inst-sim-aaa',
      conversationId: 'target-conv-1',
    }
    const simScope2: ImDeliveryScope = {
      kind: 'sim',
      instanceId: 'inst-sim-bbb',
      conversationId: 'target-conv-1',
    }

    const realScopeId = encodeScopeId(realScope)
    const sim1ScopeId = encodeScopeId(simScope1)
    const sim2ScopeId = encodeScopeId(simScope2)

    expect(realScopeId).not.toBe(sim1ScopeId)
    expect(sim1ScopeId).not.toBe(sim2ScopeId)

    // Receive message in real scope
    await deliveryService.receiveInbound({
      scope: realScope,
      externalMessageId: 'msg-001',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'real-user' },
      content: { text: 'Real message' },
    })

    // Receive message in sim scope 1
    await deliveryService.receiveInbound({
      scope: simScope1,
      externalMessageId: 'msg-001', // same externalMessageId!
      senderClassification: 'human_native',
      senderEvidence: { clientSource: 'ai_agent' },
      content: { text: 'Sim 1 message' },
    })

    // Verify history query for real scope does NOT see sim scope
    const realHistory = await deliveryService.queryHistory({ scopeId: realScopeId })
    expect(realHistory).toHaveLength(1)
    expect(realHistory[0]?.content.text).toBe('Real message')

    // Verify history query for sim 1 does NOT see real scope
    const sim1History = await deliveryService.queryHistory({ scopeId: sim1ScopeId })
    expect(sim1History).toHaveLength(1)
    expect(sim1History[0]?.content.text).toBe('Sim 1 message')

    // Verify history query for sim 2 is empty
    const sim2History = await deliveryService.queryHistory({ scopeId: sim2ScopeId })
    expect(sim2History).toHaveLength(0)
  })

  it('Requirement 5: restart persistence & reload deduplication', async () => {
    const accountId = brandString<ImAccountId>('acc-restart')
    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-restart',
    }
    const scopeId = encodeScopeId(scope)

    // Inbound message written
    await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-restart-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'u1' },
      content: { text: 'Pre-restart message' },
    })

    // Simulate service reload / restart by creating fresh Context and reopening storage domain
    const restartCtx = new Context()
    await restartCtx.plugin(Storage)
    restartCtx.storage.backend.register('memory', backend) // same backend
    const restartFacility = new DomainFacility(restartCtx, { backend: 'memory', routes: {} })
    restartCtx.storage.mount('domain', restartFacility)
    restartCtx.provide('storageDomain', restartFacility)

    await restartCtx.plugin(ImConfigService)
    await restartCtx.plugin(ImDeliveryService)
    const restartedDelivery = restartCtx.imDelivery

    // Deduplication survives restart
    const resDupe = await restartedDelivery.receiveInbound({
      scope,
      externalMessageId: 'msg-restart-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'u1' },
      content: { text: 'Attempted duplicate after restart' },
    })
    expect(resDupe.duplicate).toBe(true)
    expect(resDupe.message.content.text).toBe('Pre-restart message')

    const cursor = await restartedDelivery.getCursor(scopeId)
    expect(cursor?.lastReceivedSequenceNumber).toBe(1)
    expect(cursor?.unsubmittedCount).toBe(1)

    await restartCtx.fiber.dispose()
  })
})
