import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from './memory-backend.ts'
import { ImConfigService } from '../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  type ImOutboundRequestId,
  type ImScopeId,
  type ImMessageId,
  encodeScopeId,
  unescapeScopeComponent,
} from '../src/delivery/index.ts'

describe('ImDeliveryService T2 Acceptance Suite', () => {
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
  })

  it('Requirement 2: distinct stages (received != submitted != sent) and cursor progression', async () => {
    const accountId = brandString<ImAccountId>('acc-real-2')
    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-200',
    }
    const scopeId = encodeScopeId(scope)

    const r1 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-201',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'user-1' },
      content: { text: 'Msg 1' },
    })
    const r2 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'msg-202',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'user-2' },
      content: { text: 'Msg 2' },
    })

    expect(r2.cursor.unsubmittedCount).toBe(2)
    expect(r2.cursor.lastSubmittedSequenceNumber).toBe(0)

    // Mark msg 1 as submitted to agent
    const c1 = await deliveryService.markSubmitted({
      scopeId,
      messageIds: [r1.message.messageId],
    })
    expect(c1.lastSubmittedSequenceNumber).toBe(1)
    expect(c1.unsubmittedCount).toBe(1)

    // Query history stages
    const receivedHistory = await deliveryService.queryHistory({
      scopeId,
      stages: ['received'],
    })
    expect(receivedHistory).toHaveLength(1)
    expect(receivedHistory[0]?.messageId).toBe(r2.message.messageId)

    const submittedHistory = await deliveryService.queryHistory({
      scopeId,
      stages: ['submitted'],
    })
    expect(submittedHistory).toHaveLength(1)
    expect(submittedHistory[0]?.messageId).toBe(r1.message.messageId)
  })

  it('Requirement 3: pre-send failure vs unknown outbound receipt (never blindly retry unknown)', async () => {
    const accountId = brandString<ImAccountId>('acc-real-3')
    const wsId = brandString<WorkspaceId>('ws-test-3')
    const ruleId = brandString<ImRouteRuleId>('rule-3')

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Real DingTalk Account',
      paused: false,
    })

    // Case 3a: unconfigured conversation -> pre_send_failed
    const req1Id = brandString<ImOutboundRequestId>('req-out-1')
    const out1 = await deliveryService.registerOutbound({
      requestId: req1Id,
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId,
        conversationId: 'unconfigured-conv',
      },
      workspaceId: wsId,
      intent: 'ai',
      content: { text: 'Automated AI reply' },
    })
    expect(out1.status).toBe('pre_send_failed')
    expect(out1.preSendFailureReason).toBe('conversation_unconfigured')

    // Now configure a rule, but disable it
    await configService.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'disabled-conv' },
      workspaceId: wsId,
      enabled: false,
    })

    const req2Id = brandString<ImOutboundRequestId>('req-out-2')
    const out2 = await deliveryService.registerOutbound({
      requestId: req2Id,
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId,
        conversationId: 'disabled-conv',
      },
      workspaceId: wsId,
      intent: 'ai',
      content: { text: 'Automated reply to disabled conv' },
    })
    expect(out2.status).toBe('pre_send_failed')
    expect(out2.preSendFailureReason).toBe('conversation_route_disabled')

    // Case 3b: Human manual send is allowed even when disabled or paused!
    const reqManualId = brandString<ImOutboundRequestId>('req-manual-1')
    const outManual = await deliveryService.registerOutbound({
      requestId: reqManualId,
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId,
        conversationId: 'disabled-conv',
      },
      workspaceId: wsId,
      intent: 'human_manual',
      content: { text: 'Human owner override from DSH' },
    })
    expect(outManual.status).toBe('pending')

    // Case 3c: Outbound transmission returns result_unknown
    // Must remain result_unknown, status is marked, not auto retried
    const settledUnknown = await deliveryService.settleOutbound({
      requestId: reqManualId,
      status: 'result_unknown',
      receipt: {
        rawStatus: 'TIMEOUT_WAITING_ACK',
        errorMessage: 'Network timeout waiting platform ACK',
      },
    })
    expect(settledUnknown.status).toBe('result_unknown')
    expect(settledUnknown.receipt?.rawStatus).toBe('TIMEOUT_WAITING_ACK')

    // Fetch again to verify durable persistence
    const fetched = await deliveryService.getOutbound(reqManualId)
    expect(fetched?.status).toBe('result_unknown')
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

  it('Requirement 6: disabling conversation cancels pending AI outbound without batch re-flush', async () => {
    const accountId = brandString<ImAccountId>('acc-disable-test')
    const wsId = brandString<WorkspaceId>('ws-disable-test')
    const ruleId = brandString<ImRouteRuleId>('rule-disable-test')

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'DingTalk Account',
    })
    await configService.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'conv-cancel' },
      workspaceId: wsId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-cancel',
    }
    const scopeId = encodeScopeId(scope)

    // Register pending AI outbound message while route is enabled
    const reqId = brandString<ImOutboundRequestId>('req-ai-cancel-1')
    const reg = await deliveryService.registerOutbound({
      requestId: reqId,
      scope,
      workspaceId: wsId,
      intent: 'ai',
      content: { text: 'Pending reply before route disable' },
    })
    expect(reg.status).toBe('pending')

    // Disabling the route rule
    await configService.updateRouteRule(ruleId, {
      enabled: false,
    })

    // Cancel pending AI messages for this scope
    const cancelled = await deliveryService.cancelPendingAiOutbound(scopeId, 'conversation_route_disabled')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]?.status).toBe('pre_send_failed')
    expect(cancelled[0]?.preSendFailureReason).toBe('conversation_route_disabled')

    // Re-enabling the route rule later
    await configService.updateRouteRule(ruleId, {
      enabled: true,
    })

    // The previously cancelled message remains pre_send_failed and is NOT flushed or pending!
    const rechecked = await deliveryService.getOutbound(reqId)
    expect(rechecked?.status).toBe('pre_send_failed')
  })

  it('covers remaining delivery service edge cases and branch coverage', async () => {
    // 1. Uninitialized service throws
    const uninitCtx = new Context()
    const uninitialized = new ImDeliveryService(uninitCtx)
    await expect(
      uninitialized.getCursor(brandString<ImScopeId>('dummy')),
    ).rejects.toThrow(/not initialized/)

    // 2. unescapeScopeComponent helper
    const escaped = 'hello%3Aworld%25test'
    expect(unescapeScopeComponent(escaped)).toBe('hello:world%test')

    // 3. markSubmitted on non-existent cursor throws
    await expect(
      deliveryService.markSubmitted({
        scopeId: brandString<ImScopeId>('non-existent'),
        messageIds: [brandString<ImMessageId>('m1')],
      }),
    ).rejects.toThrow(/Cursor not found/)

    // 4. settleOutbound on non-existent request throws
    await expect(
      deliveryService.settleOutbound({
        requestId: brandString<ImOutboundRequestId>('non-existent'),
        status: 'sent',
      }),
    ).rejects.toThrow(/not found/)

    // 5. settleOutbound with sent status updates lastSentSequenceNumber
    const accountId = brandString<ImAccountId>('acc-cov-1')
    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'DingTalk Cov',
    })
    const wsId = brandString<WorkspaceId>('ws-cov-1')
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-cov-1'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'conv-cov-1' },
      workspaceId: wsId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId: 'conv-cov-1',
    }
    const scopeId = encodeScopeId(scope)

    await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-cov-1',
      senderClassification: 'external',
      senderEvidence: {},
      content: { text: 'test' },
      metadata: { env: 'test' },
    })

    const reqOut = brandString<ImOutboundRequestId>('req-cov-sent')
    await deliveryService.registerOutbound({
      requestId: reqOut,
      scope,
      workspaceId: wsId,
      intent: 'ai',
      content: { text: 'reply' },
      replyToExternalMessageId: 'ext-cov-1',
    })

    await deliveryService.settleOutbound({
      requestId: reqOut,
      status: 'sent',
      receipt: { externalReceiptId: 'rcpt-1' },
    })

    const cursorAfterSent = await deliveryService.getCursor(scopeId)
    expect(cursorAfterSent?.lastSentSequenceNumber).toBe(1)

    // Settle outbound with no existing cursor
    const dummyReq = brandString<ImOutboundRequestId>('req-no-cursor')
    await deliveryService.registerOutbound({
      requestId: dummyReq,
      scope: {
        kind: 'sim',
        instanceId: 'inst-nocursor',
        conversationId: 'conv-nocursor',
      },
      intent: 'human_manual',
      content: { text: 'no cursor' },
    })
    await deliveryService.settleOutbound({
      requestId: dummyReq,
      status: 'sent',
    })

    // 6. queryHistory pagination with beforeSequenceNumber, afterSequenceNumber, and limit truncation
    for (let i = 2; i <= 5; i++) {
      await deliveryService.receiveInbound({
        scope,
        externalMessageId: `ext-cov-${i}`,
        senderClassification: 'external',
        senderEvidence: {},
        content: { text: `msg ${i}` },
      })
    }

    const filteredBefore = await deliveryService.queryHistory({
      scopeId,
      beforeSequenceNumber: 3,
    })
    expect(filteredBefore).toHaveLength(2)

    const filteredAfter = await deliveryService.queryHistory({
      scopeId,
      afterSequenceNumber: 3,
    })
    expect(filteredAfter).toHaveLength(2)

    const limited = await deliveryService.queryHistory({
      scopeId,
      limit: 2,
    })
    expect(limited).toHaveLength(2)

    // 7. Register outbound with paused account or non-existent account
    const nonExistentAccScope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId: brandString<ImAccountId>('acc-does-not-exist'),
      conversationId: 'c1',
    }
    const outNonExistent = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-nonexistent-acc'),
      scope: nonExistentAccScope,
      intent: 'ai',
      content: { text: 'fail' },
    })
    expect(outNonExistent.status).toBe('pre_send_failed')
    expect(outNonExistent.preSendFailureReason).toBe('account_not_found')

    // Matched disabled route test
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-cov-all'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId,
      enabled: false,
    })
    const outDisabledAll = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-disabled-all'),
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId,
        conversationId: 'conv-other-direct',
      },
      intent: 'ai',
      content: { text: 'fail all disabled' },
    })
    expect(outDisabledAll.status).toBe('pre_send_failed')
    expect(outDisabledAll.preSendFailureReason).toBe('conversation_route_disabled')

    await configService.pauseAccount(accountId, true)
    const outPaused = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-paused-acc'),
      scope,
      intent: 'ai',
      content: { text: 'fail paused' },
    })
    expect(outPaused.status).toBe('pre_send_failed')
    expect(outPaused.preSendFailureReason).toBe('account_paused')

    // 9. Additional branch coverage tests
    // First submit message 5 to advance lastSubmittedSequenceNumber to 5
    const msg5Record = await deliveryService.queryHistory({ scopeId, limit: 1 })
    await deliveryService.markSubmitted({
      scopeId,
      messageIds: [msg5Record[0]!.messageId],
    })

    // Now re-submit message 5: its stage is already 'submitted' (branch 212 false)
    // and its sequenceNumber (5) is NOT > highestSeq (5) (branch 220 false)
    const dupSubmitCursor = await deliveryService.markSubmitted({
      scopeId,
      messageIds: [
        brandString<ImMessageId>('msg-does-not-exist'), // non-existent msg (branch 211 false)
        msg5Record[0]!.messageId,
      ],
    })
    expect(dupSubmitCursor).toBeDefined()

    // cancelPendingAiOutbound with other records (non-matching scope, non-pending status, non-ai intent)
    await deliveryService.cancelPendingAiOutbound(brandString<ImScopeId>('other-scope'), 'reason')
    const {
      imMessageIdSchema,
      imOutboundRequestIdSchema,
      imScopeIdSchema,
      imInboundDedupRecordSchema,
      imDeliveryDomainStateSchema,
    } = await import('../src/delivery/spec.ts')

    expect(imMessageIdSchema.parse('msg-123')).toBe('msg-123')
    expect(imOutboundRequestIdSchema.parse('req-123')).toBe('req-123')
    expect(imScopeIdSchema.parse('scope-123')).toBe('scope-123')
    expect(imDeliveryDomainStateSchema.parse({ initialized: true })).toEqual({ initialized: true })
    expect(imInboundDedupRecordSchema.parse({
      externalKey: 'k1',
      messageId: 'm1',
      scopeId: 's1',
      externalMessageId: 'e1',
      recordedAt: new Date().toISOString(),
    })).toBeDefined()
  })
})
