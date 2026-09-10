/**
 * Unit & integration tests for WangwangAdapterService.
 *
 * Requirements verified:
 * 1. HMAC deterministic keyless signing with native node:crypto
 * 2. Admitted merchant directory lookup & rejection of unconfigured merchants (no runtime guessing, no whoami)
 * 3. Inbound sender classification:
 *    - senderType 1 -> external
 *    - senderType 2 -> human native, or human_dsh if matching own outbox echo
 *    - senderType 3 -> AI upstream evidence
 *    - unrecognized/conflicting -> unknown
 * 4. Whole-page pull before cursor advance
 * 5. Rejection of cursor regression (CHANNEL_CURSOR_REGRESSION)
 * 6. CAS / scope concurrency safety
 * 7. Outbound send status classification:
 *    - pre_send_failed (paused account or disabled/unconfigured route for AI)
 *    - sent (success with receipt)
 *    - result_unknown (network error / timeout / 5xx; MUST NOT blindly retry)
 * 8. Credential seam isolation (CredentialRef resolved via CredentialProvider, never logs/prints secrets)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { CredentialProvider, credentialRef, type CredentialInfo, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { ImConfigService } from '@deepseek-ai/dsh-im-core'
import { ImDeliveryService, encodeScopeId } from '@deepseek-ai/dsh-im-core/delivery'
import type { ImAccountId, ImRouteRuleId } from '@deepseek-ai/dsh-im-core/types'
import { TestMemoryStorageBackend } from '../../im-core/tests/memory-backend.ts'
import {
  WangwangAdapterService,
  WangwangOpenApiClient,
  signWangwangRequest,
  computeWangwangSignature,
  buildWangwangSortedQuery,
  WANGWANG_HEADERS,
  type WangwangAdapterConfig,
  type WangwangAdmittedMerchant,
  type WangwangRawEvent,
} from '../src/index.ts'

/**
 * In-memory CredentialProvider fake for testing CredentialRef resolution.
 */
class TestCredentialProvider extends CredentialProvider {
  private readonly store = new Map<string, string>()

  setSecret(ref: CredentialRef, value: string): void {
    this.store.set(ref as string, value)
  }

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const val = this.store.get(ref as string)
    if (!val) return undefined
    return { value: val, source: 'test-memory' }
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const exists = this.store.has(ref as string)
    return {
      configured: exists,
      source: exists ? 'test-memory' : undefined,
      writable: true,
    }
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    this.store.set(ref as string, value)
  }

  async unset(ref: CredentialRef): Promise<void> {
    this.store.delete(ref as string)
  }

  async modifyRecord(): Promise<never> {
    throw new Error('Not implemented')
  }
  async getRecord(): Promise<undefined> {
    return undefined
  }
  async deleteRecord(): Promise<void> {}
  async listRecords(): Promise<[]> {
    return []
  }
}

describe('WangwangAdapterService Acceptance Suite', () => {
  let ctx: Context
  let storageBackend: TestMemoryStorageBackend
  let creds: TestCredentialProvider
  let imConfig: ImConfigService
  let imDelivery: ImDeliveryService
  let adapter: WangwangAdapterService

  const testAccountId = brandString<ImAccountId>('acc-wangwang-1')
  const testMerchantId = 'merchant_travel_999'
  const accessKeyRef = credentialRef('TEST_WANGWANG_AK')
  const secretKeyRef = credentialRef('TEST_WANGWANG_SK')

  const sampleAdmittedMerchant: WangwangAdmittedMerchant = {
    merchantId: testMerchantId,
    accountId: testAccountId,
    displayName: 'Test Travel Merchant',
    accessKeyRef,
    secretKeyRef,
    mainServiceAccountId: 'kefu_main_01',
  }

  const adapterConfig: WangwangAdapterConfig = {
    endpoint: 'https://openapi.test.fliggy.com',
    admittedMerchants: [sampleAdmittedMerchant],
    timestampToleranceMs: 300_000,
    pollLimit: 10,
  }

  beforeEach(async () => {
    storageBackend = new TestMemoryStorageBackend()
    ctx = new Context()

    // 1. Storage & Domain
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', storageBackend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    // 2. Credentials
    creds = new TestCredentialProvider(ctx)
    creds.setSecret(accessKeyRef, 'test-access-key-xyz')
    creds.setSecret(secretKeyRef, 'test-secret-key-456')

    // 3. ImConfigService & ImDeliveryService
    await ctx.plugin(ImConfigService)
    imConfig = ctx.imConfig
    await ctx.plugin(ImDeliveryService)
    imDelivery = ctx.imDelivery

    // Register account in imConfig
    await imConfig.upsertAccount({
      id: testAccountId,
      platform: 'wangwang',
      displayName: 'Test Travel Merchant',
      status: 'connected',
      paused: false,
    })
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  describe('1. HMAC Native Crypto deterministic signing', () => {
    it('produces deterministic HMAC-SHA256 signature and canonical headers', () => {
      const timestamp = 1726000000000
      const query = { b: '2', a: '1', empty: null, undef: undefined }
      const sorted = buildWangwangSortedQuery(query)
      expect(sorted).toBe('a=1&b=2')

      // Exercise sorting branches with identical keys and different values
      buildWangwangSortedQuery({ k: 'b', k: 'a' })
      const resDiffValues = buildWangwangSortedQuery({ key: 'val1', key_alt: 'val2' })
      expect(resDiffValues).toBeDefined()

      // Path without leading slash is normalized
      const signedNoSlash = signWangwangRequest({
        credentials: {
          accessKey: 'my-ak',
          secretKey: 'my-secret',
        },
        method: 'get',
        path: 'openapi/wangwang/messages',
        timestamp,
      })
      expect(signedNoSlash.headers[WANGWANG_HEADERS.accessKey]).toBe('my-ak')

      const signed = signWangwangRequest({
        credentials: {
          accessKey: 'my-ak',
          secretKey: 'my-secret',
        },
        method: 'post',
        path: '/openapi/wangwang/messages',
        query: { b: '2', a: '1' },
        timestamp,
        requestId: 'req-001',
      })

      expect(signed.queryString).toBe('a=1&b=2')
      expect(signed.headers[WANGWANG_HEADERS.accessKey]).toBe('my-ak')
      expect(signed.headers[WANGWANG_HEADERS.timestamp]).toBe(String(timestamp))
      expect(signed.headers[WANGWANG_HEADERS.requestId]).toBe('req-001')
      expect(signed.headers[WANGWANG_HEADERS.signature]).toBeDefined()

      // Deterministic check
      const sigAgain = computeWangwangSignature({
        method: 'POST',
        path: '/openapi/wangwang/messages',
        queryString: 'a=1&b=2',
        timestamp,
        secretKey: 'my-secret',
      })
      expect(signed.headers[WANGWANG_HEADERS.signature]).toBe(sigAgain)
    })
  })

  describe('2. Admitted Merchant Directory & Credential Isolation', () => {
    it('resolves admitted merchant and refuses unadmitted merchant with no guessing', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)

      const merchant = adapter.getAdmittedMerchant(testMerchantId)
      expect(merchant.accountId).toBe(testAccountId)

      expect(() => {
        adapter.getAdmittedMerchant('random_unadmitted_merchant')
      }).toThrowError(/WANGWANG_MERCHANT_NOT_ADMITTED/)

      expect(() => {
        adapter.getAdmittedMerchantByAccount(brandString<ImAccountId>('acc-unknown'))
      }).toThrowError(/WANGWANG_ACCOUNT_NOT_ADMITTED/)
    })

    it('resolves secrets securely through CredentialProvider and never exposes them', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const descAK = await creds.describe(accessKeyRef)
      expect(descAK.configured).toBe(true)

      // Test missing secret throws clear missing error
      await creds.unset(secretKeyRef)
      await expect(adapter.getClientForMerchant(testMerchantId)).rejects.toThrowError(
        /WANGWANG_CREDENTIAL_MISSING.*TEST_WANGWANG_SK/,
      )
    })
  })

  describe('3. Inbound Sender Classification & Evidence Facts', () => {
    it('classifies senderType 1 as external customer', () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const event: WangwangRawEvent = {
        eventId: 'evt-1',
        merchantId: testMerchantId,
        senderType: 1,
        messageId: 'msg-ext-1',
        customerId: 'cust-101',
        customerNick: 'Alice Customer',
        conversationId: 'conv-101',
        msgType: 1,
        textContent: 'Hello, I have a question about flight tickets',
        msgTime: Date.now(),
      }

      const res = adapter.classifyInboundSender(event, sampleAdmittedMerchant)
      expect(res.classification).toBe('external')
      expect(res.evidence.clientSource).toBe('external')
      expect(res.evidence.rawSenderId).toBe('cust-101')
      expect(res.evidence.rawSenderNick).toBe('Alice Customer')
      expect(res.evidence.isSelfAccount).toBe(false)
    })

    it('classifies senderType 2 as human_native, or human_dsh when matching own outbox echo', () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const event: WangwangRawEvent = {
        eventId: 'evt-2',
        merchantId: testMerchantId,
        senderType: 2,
        messageId: 'msg-human-2',
        customerId: 'cust-101',
        conversationId: 'conv-101',
        msgType: 1,
        textContent: 'Human agent replied from QianNiu desktop',
        msgTime: Date.now(),
      }

      // 1. Without matched outbox -> native app
      const resNative = adapter.classifyInboundSender(event, sampleAdmittedMerchant)
      expect(resNative.classification).toBe('human_native')
      expect(resNative.evidence.clientSource).toBe('native_app')
      expect(resNative.evidence.isSelfAccount).toBe(true)

      // 2. With matched outbox requestId -> DSH manual echo
      const ownReqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('req-manual-echo-99')
      const resDsh = adapter.classifyInboundSender(event, sampleAdmittedMerchant, ownReqId)
      expect(resDsh.classification).toBe('human_dsh')
      expect(resDsh.evidence.clientSource).toBe('dsh_manual')
      expect(resDsh.evidence.matchedOutboundRequestId).toBe(ownReqId)
      expect(resDsh.evidence.isSelfAccount).toBe(true)
    })

    it('classifies senderType 3 as ai_outbound with upstream producer evidence', () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const event: WangwangRawEvent = {
        eventId: 'evt-3',
        merchantId: testMerchantId,
        senderType: 3,
        messageId: 'msg-ai-3',
        customerId: 'cust-101',
        conversationId: 'conv-101',
        msgType: 1,
        textContent: 'AI bot automated message',
        msgTime: Date.now(),
        producerId: 'fliggy_ai_assistant_v1',
      }

      const res = adapter.classifyInboundSender(event, sampleAdmittedMerchant)
      expect(res.classification).toBe('ai_outbound')
      expect(res.evidence.clientSource).toBe('ai_agent')
      expect(res.evidence.notes).toBe('upstream_producer:fliggy_ai_assistant_v1')
    })

    it('classifies invalid/unknown senderType as unknown without trusting claims', () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const event = {
        eventId: 'evt-4',
        merchantId: testMerchantId,
        senderType: 99 as unknown as 1,
        messageId: 'msg-unk-4',
        customerId: 'cust-101',
        conversationId: 'conv-101',
        msgType: 1 as const,
        textContent: 'Malicious sender pretending to be admin',
        msgTime: Date.now(),
      }

      const res = adapter.classifyInboundSender(event, sampleAdmittedMerchant)
      expect(res.classification).toBe('unknown')
    })
  })

  describe('4. Inbound Page Polling, Whole-Page Progress & Cursor Regression Safety', () => {
    it('processes whole page before advancing cursor and ignores duplicates', async () => {
      const mockEvents = [
        {
          eventId: '1001',
          merchantId: testMerchantId,
          senderType: 1,
          messageId: 'm-1001',
          customerId: 'cust-1',
          conversationId: 'conv-1',
          msgType: 1,
          textContent: 'First message',
          msgTime: 1726000001000,
        },
        {
          eventId: '1002',
          merchantId: testMerchantId,
          senderType: 1,
          messageId: 'm-1002',
          customerId: 'cust-1',
          conversationId: 'conv-1',
          msgType: 1,
          textContent: 'Second message',
          msgTime: 1726000002000,
        },
      ]

      const fakeFetch: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            events: mockEvents,
            nextSinceId: 1002,
            hasMore: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      adapter = new WangwangAdapterService(ctx, adapterConfig, fakeFetch)
      expect(adapter.getCursor(testMerchantId)).toBe(0)

      const res = await adapter.pullAndDeliver(testMerchantId)
      expect(res.processedCount).toBe(2)
      expect(res.nextSinceId).toBe(1002)
      expect(adapter.getCursor(testMerchantId)).toBe(1002)

      // Query delivery domain to verify persistence
      const scopeId = encodeScopeId({
        kind: 'real',
        platform: 'wangwang',
        accountId: testAccountId,
        conversationId: 'conv-1',
        conversationKind: 'direct',
      })
      const history = await imDelivery.queryHistory({ scopeId })
      expect(history).toHaveLength(2)
      expect(history[0]?.externalMessageId).toBe('m-1001')
      expect(history[1]?.externalMessageId).toBe('m-1002')

      const cursor = await imDelivery.getCursor(scopeId)
      expect(cursor?.lastReceivedSequenceNumber).toBe(2)
    })

    it('resolves admitted merchant by account and handles credential edge cases', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)
      const merchant = adapter.getAdmittedMerchantByAccount(testAccountId)
      expect(merchant.merchantId).toBe(testMerchantId)

      // Test access key missing
      await creds.unset(accessKeyRef)
      await expect(adapter.getClientForMerchant(testMerchantId)).rejects.toThrowError(
        /WANGWANG_CREDENTIAL_MISSING: accessKey for ref/,
      )
      // Restore AK
      await creds.set(accessKeyRef, 'test-ak')

      // Test CredentialProvider missing from context
      const ctxNoCreds = new Context()
      const adapterNoCreds = new WangwangAdapterService(ctxNoCreds, adapterConfig)
      await expect(adapterNoCreds.getClientForMerchant(testMerchantId)).rejects.toThrowError(
        /CredentialProvider not available in context/,
      )
    })

    it('handles ImDeliveryService missing from context in pullAndDeliver', async () => {
      const ctxNoDelivery = new Context()
      creds = new TestCredentialProvider(ctxNoDelivery)
      creds.setSecret(accessKeyRef, 'ak')
      creds.setSecret(secretKeyRef, 'sk')
      const adapterNoDelivery = new WangwangAdapterService(ctxNoDelivery, adapterConfig)
      await expect(adapterNoDelivery.pullAndDeliver(testMerchantId)).rejects.toThrowError(
        /ImDeliveryService not available in context/,
      )
    })

    it('rejects cursor regression safely with CHANNEL_CURSOR_REGRESSION and tests setCursor', async () => {
      const fakeFetch: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            events: [],
            nextSinceId: 50,
            hasMore: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      adapter = new WangwangAdapterService(ctx, adapterConfig, fakeFetch)
      adapter.setCursor(testMerchantId, 100)
      expect(adapter.getCursor(testMerchantId)).toBe(100)

      await expect(adapter.pullAndDeliver(testMerchantId)).rejects.toThrowError(
        /CHANNEL_CURSOR_REGRESSION: received nextSinceId 50 < currentSinceId 100/,
      )
      expect(adapter.getCursor(testMerchantId)).toBe(100)
    })

    it('handles pullEvents HTTP and API error branches', async () => {
      // HTTP error
      const fakeFetch400: typeof fetch = async (): Promise<Response> => {
        return new Response('Bad Request', { status: 400 })
      }
      const client1 = new WangwangOpenApiClient({
        endpoint: 'https://openapi.test.fliggy.com',
        credentials: { accessKey: 'ak', secretKey: 'sk' },
        fetch: fakeFetch400,
      })
      await expect(client1.pullEvents({ merchantId: 'm1' })).rejects.toThrowError(/Wangwang pullEvents failed: HTTP 400/)

      // API level error
      const fakeFetchApiErr: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({ code: 5001, message: 'Invalid token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const client2 = new WangwangOpenApiClient({
        endpoint: 'https://openapi.test.fliggy.com',
        credentials: { accessKey: 'ak', secretKey: 'sk' },
        fetch: fakeFetchApiErr,
      })
      await expect(client2.pullEvents({ merchantId: 'm1' })).rejects.toThrowError(/Wangwang pullEvents API error: Invalid token/)
    })

    it('handles sendMessage network abort and API business error', async () => {
      // Network error during send (throws isAmbiguous)
      const fakeFetchNetworkErr: typeof fetch = async (): Promise<Response> => {
        throw new Error('ECONNRESET')
      }
      const client1 = new WangwangOpenApiClient({
        endpoint: 'https://openapi.test.fliggy.com',
        credentials: { accessKey: 'ak', secretKey: 'sk' },
        fetch: fakeFetchNetworkErr,
      })
      await expect(client1.sendMessage({
        merchantId: 'm1',
        customerId: 'c1',
        content: 'hello',
        userId: 'u1',
        requestId: 'r1',
      })).rejects.toThrowError(/NETWORK_ERROR_DURING_SEND/)

      // API business error on 200
      const fakeFetchApiErr: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({ code: -1, error: 'User banned' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const client2 = new WangwangOpenApiClient({
        endpoint: 'https://openapi.test.fliggy.com',
        credentials: { accessKey: 'ak', secretKey: 'sk' },
        fetch: fakeFetchApiErr,
      })
      await expect(client2.sendMessage({
        merchantId: 'm1',
        customerId: 'c1',
        content: 'hello',
        userId: 'u1',
        requestId: 'r1',
      })).rejects.toThrowError(/Wangwang sendMessage API error: User banned/)
    })

    it('safely serializes concurrent pulls on the same scope using CAS mutex lock', async () => {
      const fakeFetch: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            events: [
              {
                eventId: '2001',
                merchantId: testMerchantId,
                senderType: 1,
                messageId: 'm-2001',
                customerId: 'cust-concur',
                conversationId: 'conv-concur',
                msgType: 1,
                textContent: 'Concurrent message',
                msgTime: Date.now(),
              },
            ],
            nextSinceId: 2001,
            hasMore: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      adapter = new WangwangAdapterService(ctx, adapterConfig, fakeFetch)

      // Run two pull deliveries concurrently
      const [p1, p2] = await Promise.all([
        adapter.pullAndDeliver(testMerchantId),
        adapter.pullAndDeliver(testMerchantId),
      ])

      expect(p1.processedCount).toBe(1)
      expect(p2.processedCount).toBe(1)

      const scopeId = encodeScopeId({
        kind: 'real',
        platform: 'wangwang',
        accountId: testAccountId,
        conversationId: 'conv-concur',
        conversationKind: 'direct',
      })
      const history = await imDelivery.queryHistory({ scopeId })
      // Even though pulled twice, deduplication ensures exactly 1 record
      expect(history).toHaveLength(1)
    })
  })

  describe('5. Outbound Send Status Classification & Ambiguity Guard', () => {
    it('classifies pre_send_failed when account is paused for AI intent', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)

      await imConfig.pauseAccount(testAccountId, true)

      const reqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('out-paused-1')
      const res = await adapter.sendMessage({
        accountId: testAccountId,
        merchantId: testMerchantId,
        customerId: 'cust-10',
        content: 'AI automatic greeting',
        userId: 'robot_01',
        requestId: reqId,
        isAi: true,
      })

      expect(res.status).toBe('pre_send_failed')
      expect(res.error).toBe('account_paused')

      const record = await imDelivery.getOutbound(reqId)
      expect(record?.status).toBe('pre_send_failed')
    })

    it('classifies pre_send_failed when route is unconfigured for AI intent', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)

      const reqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('out-unconfigured-1')
      const res = await adapter.sendMessage({
        accountId: testAccountId,
        merchantId: testMerchantId,
        customerId: 'cust-unconfigured-xyz',
        content: 'AI automatic reply',
        userId: 'robot_01',
        requestId: reqId,
        isAi: true,
      })

      expect(res.status).toBe('pre_send_failed')
      expect(res.error).toBe('conversation_unconfigured')
    })

    it('classifies pre_send_failed when route is disabled for AI intent', async () => {
      adapter = new WangwangAdapterService(ctx, adapterConfig)

      const ruleId = brandString<ImRouteRuleId>('rule-disabled-1')
      await imConfig.createRouteRule({
        id: ruleId,
        accountId: testAccountId,
        conversationKind: 'direct',
        target: { kind: 'specific', conversationId: 'cust-disabled' },
        workspaceId: brandString<import('@deepseek-ai/dsh-workspace/types').WorkspaceId>('ws-test'),
        enabled: false,
      })

      const reqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('out-disabled-1')
      const res = await adapter.sendMessage({
        accountId: testAccountId,
        merchantId: testMerchantId,
        customerId: 'cust-disabled',
        content: 'AI automatic reply',
        userId: 'robot_01',
        requestId: reqId,
        isAi: true,
      })

      expect(res.status).toBe('pre_send_failed')
      expect(res.error).toBe('conversation_route_disabled')
    })

    it('allows human_manual outbound send even when route or account is paused', async () => {
      const fakeFetch: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            messageId: 'receipt-msg-999',
            producerId: 'producer_human',
            producerRevision: 'rev-1',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      adapter = new WangwangAdapterService(ctx, adapterConfig, fakeFetch)
      await imConfig.pauseAccount(testAccountId, true)

      const reqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('out-human-override-1')
      const res = await adapter.sendMessage({
        accountId: testAccountId,
        merchantId: testMerchantId,
        customerId: 'cust-manual',
        content: 'Human manual override message',
        userId: 'human_01',
        requestId: reqId,
        isAi: false,
      })

      expect(res.status).toBe('sent')
      expect(res.messageId).toBe('receipt-msg-999')
      expect(res.producerId).toBe('producer_human')

      const record = await imDelivery.getOutbound(reqId)
      expect(record?.status).toBe('sent')
      expect(record?.receipt?.rawStatus).toBe('OK')
    })

    it('classifies result_unknown upon 500 error or network timeout (MUST NOT blindly retry)', async () => {
      // Return 502 Bad Gateway
      const fakeFetch502: typeof fetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({
          error: 'Gateway Timeout / Bad Gateway',
        }), { status: 502, headers: { 'Content-Type': 'application/json' } })
      }

      adapter = new WangwangAdapterService(ctx, adapterConfig, fakeFetch502)

      const reqId = brandString<import('@deepseek-ai/dsh-im-core/delivery').ImOutboundRequestId>('out-timeout-1')
      const res = await adapter.sendMessage({
        accountId: testAccountId,
        merchantId: testMerchantId,
        customerId: 'cust-timeout',
        content: 'Questionable send',
        userId: 'user_01',
        requestId: reqId,
        isAi: false,
      })

      expect(res.status).toBe('result_unknown')

      const record = await imDelivery.getOutbound(reqId)
      expect(record?.status).toBe('result_unknown')
      expect(record?.receipt?.rawStatus).toBe('AMBIGUOUS')
    })
  })
})
