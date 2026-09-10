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
  encodeScopeId,
} from '../../src/delivery/index.ts'

describe('ImDeliveryService - Outbound Delivery & Safety', () => {
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

    // cancelPendingAiOutbound on other non-matching scope
    await deliveryService.cancelPendingAiOutbound(brandString<ImScopeId>('other-scope'), 'reason')
  })

  it('handles settleOutbound and registerOutbound edge cases', async () => {
    // Settle non-existent throws
    await expect(
      deliveryService.settleOutbound({
        requestId: brandString<ImOutboundRequestId>('missing-req'),
        status: 'sent',
      }),
    ).rejects.toThrow(/not found/)

    // Outbound on non-existent account
    const outNonExistent = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-nonexistent'),
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId: brandString<ImAccountId>('acc-nonexistent'),
        conversationId: 'c1',
      },
      intent: 'ai',
      content: { text: 'fail' },
    })
    expect(outNonExistent.status).toBe('pre_send_failed')
    expect(outNonExistent.preSendFailureReason).toBe('account_not_found')

    // Paused account
    const accId = brandString<ImAccountId>('acc-paused-test')
    await configService.upsertAccount({
      id: accId,
      platform: 'dingtalk',
      displayName: 'Paused DingTalk',
      paused: true,
    })
    const outPaused = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-paused'),
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId: accId,
        conversationId: 'c1',
      },
      intent: 'ai',
      content: { text: 'fail' },
    })
    expect(outPaused.status).toBe('pre_send_failed')
    expect(outPaused.preSendFailureReason).toBe('account_paused')

    // Disabled 'all' rule match
    const wsId = brandString<WorkspaceId>('ws-all-dis')
    await configService.pauseAccount(accId, false)
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-all-dis'),
      accountId: accId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId,
      enabled: false,
    })
    const outAllDis = await deliveryService.registerOutbound({
      requestId: brandString<ImOutboundRequestId>('req-all-dis'),
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId: accId,
        conversationId: 'dyn-c1',
      },
      intent: 'ai',
      content: { text: 'fail' },
    })
    expect(outAllDis.status).toBe('pre_send_failed')
    expect(outAllDis.preSendFailureReason).toBe('conversation_route_disabled')
  })
})
