/**
 * Crash recovery and outbox-verified sender identity tests.
 *
 * Every adapter boots through the public cordis plugin lifecycle (`ctx.plugin`),
 * the same path that runs `[Service.init]` in production. Type 2/3 inbound
 * events are verified against the durable local outbox echo index written by
 * real `sendMessage` settlements, cross-checked with ImDeliveryService records.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { encodeScopeId, type ImOutboundRequestId } from '@deepseek-ai/dsh-im-core/delivery'
import type { ImRouteRuleId } from '@deepseek-ai/dsh-im-core/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from '../../im-core/tests/memory-backend.ts'
import type { WangwangAdapterService, WangwangRawEvent } from '../src/index.ts'
import {
  createWangwangTestRig,
  pullPageFetch,
  startWangwangAdapter,
  testAccountId,
  testMerchant,
  testMerchantId,
  wangwangEvent,
  type WangwangTestRig,
} from './fixtures/testkit.ts'

describe('WangwangAdapterService - Crash Recovery & Outbox Sender Identity', () => {
  const rigs: WangwangTestRig[] = []

  afterEach(async () => {
    for (const rig of rigs.splice(0)) await rig.ctx.fiber.dispose()
  })

  async function rig(backend?: TestMemoryStorageBackend): Promise<WangwangTestRig> {
    const created = await createWangwangTestRig(backend)
    rigs.push(created)
    return created
  }

  /** Send one DSH manual message and return its requestId. */
  async function sendManualEcho(adapter: WangwangAdapterService, messageId: string): Promise<ImOutboundRequestId> {
    const requestId = brandString<ImOutboundRequestId>(`req-${messageId}`)
    const res = await adapter.sendMessage({
      accountId: testAccountId,
      merchantId: testMerchantId,
      customerId: 'cust-echo',
      content: 'DSH manual reply',
      userId: 'human_01',
      requestId,
      isAi: false,
    })
    expect(res.status).toBe('sent')
    expect(res.messageId).toBe(messageId)
    return requestId
  }

  /** Register an enabled AI route, send one DSH AI message, return its requestId. */
  async function sendAiEcho(rigCtx: WangwangTestRig, adapter: WangwangAdapterService, messageId: string): Promise<ImOutboundRequestId> {
    await rigCtx.imConfig.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-ai-echo'),
      accountId: testAccountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'cust-ai' },
      workspaceId: brandString<WorkspaceId>('ws-ai-echo'),
      enabled: true,
    })
    const requestId = brandString<ImOutboundRequestId>(`req-${messageId}`)
    const res = await adapter.sendMessage({
      accountId: testAccountId,
      merchantId: testMerchantId,
      customerId: 'cust-ai',
      content: 'DSH AI reply',
      userId: 'robot_01',
      requestId,
      isAi: true,
    })
    expect(res.status).toBe('sent')
    expect(res.messageId).toBe(messageId)
    return requestId
  }

  it('survives host restart without losing the durable channel cursor, and dedups crash replay', async () => {
    const backend = new TestMemoryStorageBackend()
    const page = {
      events: [wangwangEvent({
        eventId: '500',
        messageId: 'msg-500',
        customerId: 'cust-500',
        conversationId: 'conv-500',
        textContent: 'Msg 500',
      })],
      nextSinceId: 500,
    }

    // Generation 1: pull events up to sinceId 500
    const rig1 = await rig(backend)
    const adapter1 = await startWangwangAdapter(rig1.ctx, undefined, pullPageFetch(page))
    const first = await adapter1.pullAndDeliver(testMerchantId)
    expect(first.processedCount).toBe(1)
    expect(adapter1.getDurableCursor(testMerchantId)).toBe(500)
    await rig1.ctx.fiber.dispose()
    rigs.splice(rigs.indexOf(rig1), 1)

    // Generation 2 (simulated restart): fresh context over the SAME durable backend
    const rig2 = await rig(backend)
    const adapter2 = await startWangwangAdapter(rig2.ctx, undefined, pullPageFetch(page))
    expect(adapter2.getDurableCursor(testMerchantId)).toBe(500)

    // Crash replay: re-pulling the already-ingested page is deduplicated
    const replay = await adapter2.pullAndDeliver(testMerchantId)
    expect(replay.processedCount).toBe(1)
    const scopeId = encodeScopeId({
      kind: 'real',
      platform: 'wangwang',
      accountId: testAccountId,
      conversationId: 'conv-500',
      conversationKind: 'direct',
    })
    expect(await rig2.imDelivery.queryHistory({ scopeId })).toHaveLength(1)
    expect(adapter2.getDurableCursor(testMerchantId)).toBe(500)
  })

  it('classifies senderType 1 as external customer without consulting the outbox', async () => {
    const rig1 = await rig()
    const adapter = await startWangwangAdapter(rig1.ctx)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const withNick = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ messageId: 'msg-ext-1', customerId: 'cust-101', customerNick: 'Alice Customer' }),
      merchant,
    )
    expect(withNick.classification).toBe('external')
    expect(withNick.evidence.clientSource).toBe('external')
    expect(withNick.evidence.rawSenderId).toBe('cust-101')
    expect(withNick.evidence.rawSenderNick).toBe('Alice Customer')
    expect(withNick.evidence.isSelfAccount).toBe(false)

    const noNick = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ messageId: 'msg-ext-2', customerId: 'cust-102' }),
      merchant,
    )
    expect(noNick.classification).toBe('external')
    expect(noNick.evidence.rawSenderNick).toBeUndefined()
  })

  it('Type 2: DSH manual send echo -> human_dsh, verified against the local outbox end-to-end', async () => {
    const rig1 = await rig()
    // One adapter whose fetch answers both send (POST /messages) and pull (GET /events)
    const echoEvent = wangwangEvent({
      senderType: 2,
      messageId: 'mm-echo-1',
      conversationId: 'conv-echo',
      textContent: 'DSH manual reply',
    })
    const flowFetch: typeof fetch = async (input): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname.endsWith('/messages')) {
        return new Response(JSON.stringify({ code: 0, data: { messageId: 'mm-echo-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { events: [echoEvent], nextSinceId: 10, hasMore: false },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const adapter = await startWangwangAdapter(rig1.ctx, undefined, flowFetch)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const requestId = await sendManualEcho(adapter, 'mm-echo-1')

    // 对照: the local outbox holds the settled human_manual record
    const outbox = await rig1.imDelivery.getOutbound(requestId)
    expect(outbox?.intent).toBe('human_manual')
    expect(outbox?.status).toBe('sent')

    // Direct resolution: the echo classifies as human_dsh with outbox reference
    const res = adapter.resolveSenderWithOutboxEvidence(echoEvent, merchant)
    expect(res.classification).toBe('human_dsh')
    expect(res.evidence.clientSource).toBe('dsh_manual')
    expect(res.evidence.matchedOutboundRequestId).toBe(requestId)
    expect(res.evidence.isSelfAccount).toBe(true)

    // End-to-end: the pulled echo lands in history classified from local evidence
    await adapter.pullAndDeliver(testMerchantId)
    const scopeId = encodeScopeId({
      kind: 'real',
      platform: 'wangwang',
      accountId: testAccountId,
      conversationId: 'conv-echo',
      conversationKind: 'direct',
    })
    const history = await rig1.imDelivery.queryHistory({ scopeId })
    expect(history).toHaveLength(1)
    expect(history[0]?.senderClassification).toBe('human_dsh')
    expect(history[0]?.senderEvidence.matchedOutboundRequestId).toBe(requestId)
  })

  it('Type 2: no matching local echo -> human_native', async () => {
    const rig1 = await rig()
    const adapter = await startWangwangAdapter(rig1.ctx)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const res = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 2, messageId: 'msg-native-1', textContent: 'Replied from QianNiu desktop' }),
      merchant,
    )
    expect(res.classification).toBe('human_native')
    expect(res.evidence.clientSource).toBe('native_app')
    expect(res.evidence.rawSenderId).toBe('kefu_main_01')
    expect(res.evidence.isSelfAccount).toBe(true)

    // Merchant without a main service account falls back to the merchantId as sender id
    const bareMerchant = { ...testMerchant }
    delete (bareMerchant as { mainServiceAccountId?: string }).mainServiceAccountId
    const fallback = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 2, messageId: 'msg-native-2' }),
      bareMerchant,
    )
    expect(fallback.classification).toBe('human_native')
    expect(fallback.evidence.rawSenderId).toBe(testMerchantId)
  })

  it('Type 3: registered DSH AI outbound echo -> ai_outbound with outbox evidence', async () => {
    const rig1 = await rig()
    const adapter = await startWangwangAdapter(
      rig1.ctx,
      undefined,
      async (): Promise<Response> => new Response(
        JSON.stringify({ code: 0, data: { messageId: 'am-echo-1', producerId: 'dsh_agent_v1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const requestId = await sendAiEcho(rig1, adapter, 'am-echo-1')

    // 对照: the local outbox holds the settled AI record
    const outbox = await rig1.imDelivery.getOutbound(requestId)
    expect(outbox?.intent).toBe('ai')
    expect(outbox?.status).toBe('sent')

    const res = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 3, messageId: 'am-echo-1', producerId: 'dsh_agent_v1' }),
      merchant,
    )
    expect(res.classification).toBe('ai_outbound')
    expect(res.evidence.clientSource).toBe('ai_agent')
    expect(res.evidence.matchedOutboundRequestId).toBe(requestId)
    expect(res.evidence.notes).toBe('upstream_producer:dsh_agent_v1')

    // The same matched echo without an upstream producerId carries no producer note
    const noProducer = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 3, messageId: 'am-echo-1' }),
      merchant,
    )
    expect(noProducer.classification).toBe('ai_outbound')
    expect(noProducer.evidence.notes).toBeUndefined()
  })

  it('Type 3: unregistered AI claim -> unknown (never trusts upstream self-attestation)', async () => {
    const rig1 = await rig()
    const adapter = await startWangwangAdapter(rig1.ctx)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const withProducer = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 3, messageId: 'msg-foreign-ai', producerId: 'unknown_producer' }),
      merchant,
    )
    expect(withProducer.classification).toBe('unknown')
    expect(withProducer.evidence.notes).toBe('upstream_unverified_ai:unknown_producer')
    expect(withProducer.evidence.matchedOutboundRequestId).toBeUndefined()

    const noProducer = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 3, messageId: 'msg-foreign-ai-2' }),
      merchant,
    )
    expect(noProducer.classification).toBe('unknown')
    expect(noProducer.evidence.notes).toBe('unverified_ai_sender')
  })

  it('Type 2/3 claims conflicting with local echo intent degrade to unknown', async () => {
    const rig1 = await rig()
    let nextMessageId = ''
    const conflictFetch: typeof fetch = async (): Promise<Response> => new Response(
      JSON.stringify({ code: 0, data: { messageId: nextMessageId } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    const adapter = await startWangwangAdapter(rig1.ctx, undefined, conflictFetch)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    // A DSH AI send echoed back with a human-native (Type 2) claim
    nextMessageId = 'am-conflict-1'
    const aiRequestId = await sendAiEcho(rig1, adapter, 'am-conflict-1')
    const humanClaimOnAi = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 2, messageId: 'am-conflict-1' }),
      merchant,
    )
    expect(humanClaimOnAi.classification).toBe('unknown')
    expect(humanClaimOnAi.evidence.matchedOutboundRequestId).toBe(aiRequestId)
    expect(humanClaimOnAi.evidence.notes).toBe('claim_conflict:upstream_human_native_vs_local_ai')

    // A DSH manual send echoed back with an AI (Type 3) claim
    nextMessageId = 'mm-conflict-1'
    const manualRequestId = await sendManualEcho(adapter, 'mm-conflict-1')
    const aiClaimOnManual = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ senderType: 3, messageId: 'mm-conflict-1' }),
      merchant,
    )
    expect(aiClaimOnManual.classification).toBe('unknown')
    expect(aiClaimOnManual.evidence.matchedOutboundRequestId).toBe(manualRequestId)
    expect(aiClaimOnManual.evidence.notes).toBe('claim_conflict:upstream_ai_vs_local_human_manual')
  })

  it('classifies unrecognized or missing senderType as unknown', async () => {
    const rig1 = await rig()
    const adapter = await startWangwangAdapter(rig1.ctx)
    const merchant = adapter.getAdmittedMerchant(testMerchantId)

    const weird = adapter.resolveSenderWithOutboxEvidence(
      wangwangEvent({ messageId: 'msg-unk-1', senderType: 99 as unknown as 1 }),
      merchant,
    )
    expect(weird.classification).toBe('unknown')
    expect(weird.evidence.rawSenderId).toBe('99')

    const missing = { ...wangwangEvent({ messageId: 'msg-unk-2' }) } as Record<string, unknown>
    delete missing.senderType
    const noType = adapter.resolveSenderWithOutboxEvidence(missing as unknown as WangwangRawEvent, merchant)
    expect(noType.classification).toBe('unknown')
    expect(noType.evidence.rawSenderId).toBe('unknown')
  })
})
