/**
 * Inbound page polling tests: whole-page progression, durable cursor advancement,
 * regression rejection, and per-merchant pull serialization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { encodeScopeId } from '@deepseek-ai/dsh-im-core/delivery'
import { WangwangAdapterService } from '../src/index.ts'
import {
  TestCredentialProvider,
  accessKeyRef,
  createWangwangTestRig,
  pullPageFetch,
  secretKeyRef,
  startWangwangAdapter,
  testAccountId,
  testAdapterConfig,
  testMerchantId,
  wangwangEvent,
  type WangwangTestRig,
} from './fixtures/testkit.ts'

describe('WangwangAdapterService - Inbound Page Polling & Durable Cursor', () => {
  let rig: WangwangTestRig

  beforeEach(async () => {
    rig = await createWangwangTestRig()
  })

  afterEach(async () => {
    await rig.ctx.fiber.dispose()
  })

  it('processes the whole page before advancing the durable cursor and dedups re-pulls', async () => {
    const events = [
      wangwangEvent({
        eventId: '1001',
        messageId: 'm-1001',
        customerNick: 'Alice Customer',
        customerAvatar: 'https://img.test/avatar.png',
        textContent: 'First message',
        msgTime: 1726000001000,
        attachments: [
          { mediaType: 'image', mediaUrl: 'https://img.test/a.png', label: 'screenshot' },
          { mediaType: 'file', mediaUrl: 'https://img.test/b.pdf' },
        ],
        producerId: 'producer_x',
      }),
      wangwangEvent({
        eventId: '1002',
        messageId: 'm-1002',
        msgType: 2,
        textContent: '**Second message**',
        msgTime: 0,
      }),
    ]

    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, pullPageFetch({
      events,
      nextSinceId: 1002,
    }))

    expect(adapter.getDurableCursor(testMerchantId)).toBe(0)

    const res = await adapter.pullAndDeliver(testMerchantId)
    expect(res.processedCount).toBe(2)
    expect(res.nextSinceId).toBe(1002)
    expect(res.hasMore).toBe(false)
    expect(adapter.getDurableCursor(testMerchantId)).toBe(1002)

    // Verify persistence in the delivery domain
    const scopeId = encodeScopeId({
      kind: 'real',
      platform: 'wangwang',
      accountId: testAccountId,
      conversationId: 'conv-1',
      conversationKind: 'direct',
    })
    const history = await rig.imDelivery.queryHistory({ scopeId })
    expect(history).toHaveLength(2)
    expect(history[0]?.externalMessageId).toBe('m-1001')
    expect(history[0]?.content.contentType).toBe('text')
    expect(history[0]?.senderClassification).toBe('external')
    expect(history[1]?.externalMessageId).toBe('m-1002')
    expect(history[1]?.content.contentType).toBe('markdown')

    const cursor = await rig.imDelivery.getCursor(scopeId)
    expect(cursor?.lastReceivedSequenceNumber).toBe(2)

    // Re-pulling the same page (crash replay) is deduplicated by externalMessageId
    const replay = await adapter.pullAndDeliver(testMerchantId)
    expect(replay.processedCount).toBe(2)
    expect(await rig.imDelivery.queryHistory({ scopeId })).toHaveLength(2)
  })

  it('rejects cursor regression safely with CHANNEL_CURSOR_REGRESSION', async () => {
    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, pullPageFetch({
      events: [],
      nextSinceId: 50,
    }))

    await adapter.setDurableCursor(testMerchantId, 100)
    expect(adapter.getDurableCursor(testMerchantId)).toBe(100)

    await expect(adapter.pullAndDeliver(testMerchantId)).rejects.toThrow(
      /CHANNEL_CURSOR_REGRESSION: received nextSinceId 50 < currentSinceId 100/,
    )
    expect(adapter.getDurableCursor(testMerchantId)).toBe(100)
  })

  it('serializes concurrent pulls per merchant so the second pull observes the advanced cursor', async () => {
    const seenSinceIds: number[] = []
    const serializedFetch: typeof fetch = async (input): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const sinceId = Number(url.searchParams.get('sinceId') ?? '0')
      seenSinceIds.push(sinceId)
      if (sinceId === 0) {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            events: [wangwangEvent({
              eventId: '2001',
              messageId: 'm-2001',
              conversationId: 'conv-concur',
              textContent: 'Concurrent message',
              msgTime: Date.now(),
            })],
            nextSinceId: 2001,
            hasMore: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { events: [], nextSinceId: sinceId, hasMore: false },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, serializedFetch)

    const [p1, p2] = await Promise.all([
      adapter.pullAndDeliver(testMerchantId),
      adapter.pullAndDeliver(testMerchantId),
    ])

    // Serialized: the second pull started only after the first advanced the durable cursor
    expect(seenSinceIds).toEqual([0, 2001])
    expect(p1.processedCount).toBe(1)
    expect(p2.processedCount).toBe(0)
    expect(adapter.getDurableCursor(testMerchantId)).toBe(2001)

    const scopeId = encodeScopeId({
      kind: 'real',
      platform: 'wangwang',
      accountId: testAccountId,
      conversationId: 'conv-concur',
      conversationKind: 'direct',
    })
    expect(await rig.imDelivery.queryHistory({ scopeId })).toHaveLength(1)
  })

  it('refuses unadmitted merchants and missing ImDeliveryService', async () => {
    const adapter = await startWangwangAdapter(rig.ctx, testAdapterConfig, pullPageFetch({
      events: [],
      nextSinceId: 0,
    }))
    await expect(adapter.pullAndDeliver('unadmitted_merchant')).rejects.toThrow(
      /WANGWANG_MERCHANT_NOT_ADMITTED/,
    )

    // Without ImDeliveryService in context, pull fails loud before any fetch
    const bareCtx = new Context()
    const bareCreds = new TestCredentialProvider(bareCtx)
    bareCreds.setSecret(accessKeyRef, 'ak')
    bareCreds.setSecret(secretKeyRef, 'sk')
    const noDelivery = new WangwangAdapterService(bareCtx, testAdapterConfig)
    await expect(noDelivery.pullAndDeliver(testMerchantId)).rejects.toThrow(
      /ImDeliveryService not available in context/,
    )
    await bareCtx.fiber.dispose()
  })
})
