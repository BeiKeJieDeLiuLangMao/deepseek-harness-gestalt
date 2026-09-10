/**
 * Outbound send tests: pre-send validation owned by ImDeliveryService,
 * success receipts with durable echo evidence, and ambiguity guards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ImOutboundRequestId } from '@deepseek-ai/dsh-im-core/delivery'
import type { ImRouteRuleId } from '@deepseek-ai/dsh-im-core/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  TestCredentialProvider,
  accessKeyRef,
  createWangwangTestRig,
  secretKeyRef,
  sendReceiptFetch,
  startWangwangAdapter,
  testAccountId,
  testAdapterConfig,
  testMerchantId,
  type WangwangTestRig,
} from './fixtures/testkit.ts'
import { WangwangAdapterService } from '../src/index.ts'

function sendRequest(overrides: {
  requestId: string
  customerId: string
  isAi: boolean
  content?: string
}) {
  return {
    accountId: testAccountId,
    merchantId: testMerchantId,
    customerId: overrides.customerId,
    content: overrides.content ?? 'fixture outbound',
    userId: 'robot_01',
    requestId: brandString<ImOutboundRequestId>(overrides.requestId),
    isAi: overrides.isAi,
  }
}

describe('WangwangAdapterService - Outbound Send Status Classification', () => {
  let rig: WangwangTestRig

  beforeEach(async () => {
    rig = await createWangwangTestRig()
  })

  afterEach(async () => {
    await rig.ctx.fiber.dispose()
  })

  it('classifies pre_send_failed when account is paused for AI intent', async () => {
    const adapter = await startWangwangAdapter(rig.ctx)
    await rig.imConfig.pauseAccount(testAccountId, true)

    const req = sendRequest({ requestId: 'out-paused-1', customerId: 'cust-10', isAi: true })
    const res = await adapter.sendMessage(req)

    expect(res.status).toBe('pre_send_failed')
    expect(res.error).toBe('account_paused')

    const record = await rig.imDelivery.getOutbound(req.requestId)
    expect(record?.status).toBe('pre_send_failed')
    expect(record?.preSendFailureReason).toBe('account_paused')
  })

  it('classifies pre_send_failed when route is unconfigured for AI intent', async () => {
    const adapter = await startWangwangAdapter(rig.ctx)

    const res = await adapter.sendMessage(sendRequest({
      requestId: 'out-unconfigured-1',
      customerId: 'cust-unconfigured-xyz',
      isAi: true,
    }))

    expect(res.status).toBe('pre_send_failed')
    expect(res.error).toBe('conversation_unconfigured')
  })

  it('classifies pre_send_failed when route is disabled for AI intent', async () => {
    const adapter = await startWangwangAdapter(rig.ctx)
    await rig.imConfig.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-disabled-1'),
      accountId: testAccountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'cust-disabled' },
      workspaceId: brandString<WorkspaceId>('ws-test'),
      enabled: false,
    })

    const res = await adapter.sendMessage(sendRequest({
      requestId: 'out-disabled-1',
      customerId: 'cust-disabled',
      isAi: true,
    }))

    expect(res.status).toBe('pre_send_failed')
    expect(res.error).toBe('conversation_route_disabled')
  })

  it('maps a reason-less pre_send_failed registration defensively', async () => {
    // Contract drift guard: a pre_send_failed record without a reason still
    // surfaces a stable error string instead of undefined.
    const stubCtx = new Context()
    const stubCreds = new TestCredentialProvider(stubCtx)
    stubCreds.setSecret(accessKeyRef, 'ak')
    stubCreds.setSecret(secretKeyRef, 'sk')
    stubCtx.provide('imDelivery', {
      registerOutbound: async () => ({ status: 'pre_send_failed' }),
    })
    const adapter = new WangwangAdapterService(stubCtx, testAdapterConfig)

    const res = await adapter.sendMessage(sendRequest({
      requestId: 'out-reasonless-1',
      customerId: 'cust-10',
      isAi: true,
    }))
    expect(res.status).toBe('pre_send_failed')
    expect(res.error).toBe('pre_send_failed')
    await stubCtx.fiber.dispose()
  })

  it('allows human_manual outbound send even when account is paused', async () => {
    const adapter = await startWangwangAdapter(
      rig.ctx,
      testAdapterConfig,
      sendReceiptFetch('receipt-msg-999', { producerId: 'producer_human', producerRevision: 'rev-1' }),
    )
    await rig.imConfig.pauseAccount(testAccountId, true)

    const req = sendRequest({ requestId: 'out-human-override-1', customerId: 'cust-manual', isAi: false })
    const res = await adapter.sendMessage(req)

    expect(res.status).toBe('sent')
    expect(res.messageId).toBe('receipt-msg-999')
    expect(res.producerId).toBe('producer_human')
    expect(res.producerRevision).toBe('rev-1')

    const record = await rig.imDelivery.getOutbound(req.requestId)
    expect(record?.status).toBe('sent')
    expect(record?.receipt?.rawStatus).toBe('OK')
  })

  it('succeeds without producer fields and omits them from the result', async () => {
    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, sendReceiptFetch('receipt-plain-1'))

    const req = sendRequest({ requestId: 'out-plain-1', customerId: 'cust-plain', isAi: false })
    const res = await adapter.sendMessage(req)

    expect(res.status).toBe('sent')
    expect(res.messageId).toBe('receipt-plain-1')
    expect(res.producerId).toBeUndefined()
    expect(res.producerRevision).toBeUndefined()
  })

  it('classifies result_unknown upon 5xx or network ambiguity (MUST NOT blindly retry)', async () => {
    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, async (): Promise<Response> => {
      return new Response(JSON.stringify({ error: 'Gateway Timeout / Bad Gateway' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const req = sendRequest({ requestId: 'out-timeout-1', customerId: 'cust-timeout', isAi: false })
    const res = await adapter.sendMessage(req)

    expect(res.status).toBe('result_unknown')

    const record = await rig.imDelivery.getOutbound(req.requestId)
    expect(record?.status).toBe('result_unknown')
    expect(record?.receipt?.rawStatus).toBe('AMBIGUOUS')
  })

  it('classifies confirmed failure on non-ambiguous HTTP errors', async () => {
    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, async (): Promise<Response> => {
      return new Response('Bad Request', { status: 400 })
    })

    const req = sendRequest({ requestId: 'out-badrequest-1', customerId: 'cust-bad', isAi: false })
    const res = await adapter.sendMessage(req)

    expect(res.status).toBe('pre_send_failed')
    expect(res.error).toMatch(/Wangwang sendMessage failed: HTTP 400/)

    const record = await rig.imDelivery.getOutbound(req.requestId)
    expect(record?.status).toBe('confirmed_failed')
    expect(record?.receipt?.rawStatus).toBe('FAILED')
  })

  it('fails loud when ImDeliveryService is absent from the context', async () => {
    const bareCtx = new Context()
    const bareCreds = new TestCredentialProvider(bareCtx)
    bareCreds.setSecret(accessKeyRef, 'ak')
    bareCreds.setSecret(secretKeyRef, 'sk')
    const noDelivery = new WangwangAdapterService(bareCtx, testAdapterConfig)

    await expect(noDelivery.sendMessage(sendRequest({
      requestId: 'out-nodelivery-1',
      customerId: 'cust-10',
      isAi: false,
    }))).rejects.toThrow(/ImDeliveryService not available in context/)
    await bareCtx.fiber.dispose()
  })
})
