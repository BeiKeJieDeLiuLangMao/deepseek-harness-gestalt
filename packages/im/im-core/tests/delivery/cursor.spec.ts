import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  type ImOutboundRequestId,
  type ImScopeId,
  type ImMessageId,
  encodeScopeId,
} from '../../src/delivery/index.ts'

describe('ImDeliveryService - Cursor Progress & History Query', () => {
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

  it('covers history pagination, filters, and cursor updates after outbound sent', async () => {
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

    // Pagination tests
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

    // markSubmitted sequence branches
    const msg5Record = await deliveryService.queryHistory({ scopeId, limit: 1 })
    await deliveryService.markSubmitted({
      scopeId,
      messageIds: [msg5Record[0]!.messageId],
    })

    const dupSubmitCursor = await deliveryService.markSubmitted({
      scopeId,
      messageIds: [
        brandString<ImMessageId>('msg-does-not-exist'),
        msg5Record[0]!.messageId,
      ],
    })
    expect(dupSubmitCursor).toBeDefined()
  })

  it('handles service errors and zod schemas', async () => {
    // Uninitialized throws
    const uninitCtx = new Context()
    const uninitialized = new ImDeliveryService(uninitCtx)
    await expect(
      uninitialized.getCursor(brandString<ImScopeId>('dummy')),
    ).rejects.toThrow(/not initialized/)

    // markSubmitted with missing cursor throws
    await expect(
      deliveryService.markSubmitted({
        scopeId: brandString<ImScopeId>('non-existent'),
        messageIds: [brandString<ImMessageId>('m1')],
      }),
    ).rejects.toThrow(/Cursor not found/)

    // Schemas
    const {
      imMessageIdSchema,
      imOutboundRequestIdSchema,
      imScopeIdSchema,
      imInboundDedupRecordSchema,
      imDeliveryDomainStateSchema,
    } = await import('../../src/delivery/spec.ts')

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

    // Query empty cursor for untouched scope
    const emptyCursor = await deliveryService.getCursor(brandString<ImScopeId>('untouched-scope'))
    expect(emptyCursor).toBeUndefined()
  })
})
