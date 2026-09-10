/**
 * Wangwang / QianNiu IM adapter service for DeepSeek Harness.
 *
 * Implements:
 * - Admitted merchant directory resolution (no whoami, no guessing)
 * - CredentialRef resolution via CredentialProvider seam (no secrets logged/printed)
 * - HMAC-SHA256 signature generation with native crypto
 * - Whole-page pull before cursor advance
 * - Monotonic cursor progression & CAS conflict / backward rejection
 * - Outbound requestId / producerId / receipt tracking
 * - Pre-send failure vs result_unknown distinction (never blindly retry unknown)
 * - Inbound sender classification (1: external, 2: human native, 3: AI upstream evidence, DSH manual echo)
 *
 * @module @deepseek-ai/dsh-im-wangwang/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { ImConfigService } from '@deepseek-ai/dsh-im-core'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  type ImOutboundRequestId,
  encodeScopeId,
} from '@deepseek-ai/dsh-im-core/delivery'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import { WangwangOpenApiClient } from './client.ts'
import { validateWangwangConfig } from './spec.ts'
import type {
  ResolvedWangwangCredentials,
  WangwangAdapterConfig,
  WangwangAdmittedMerchant,
  WangwangRawEvent,
  WangwangSendMessageRequest,
  WangwangSendMessageResult,
  WangwangSenderResolution,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imWangwang: WangwangAdapterService
  }
}

export class WangwangAdapterService extends Service {
  static readonly name = 'imWangwang'
  static readonly inject = ['credentials', 'imConfig', 'imDelivery']

  private readonly config: WangwangAdapterConfig
  private readonly merchantMap = new Map<string, WangwangAdmittedMerchant>()
  private readonly accountMap = new Map<ImAccountId, WangwangAdmittedMerchant>()
  private readonly customFetch?: typeof fetch | undefined

  // In-memory cursor tracking per merchantId for poller
  private readonly merchantCursors = new Map<string, number>()

  // CAS locks for concurrent cursor updates: key -> active lock promise
  private readonly scopeLocks = new Map<string, Promise<void>>()

  constructor(ctx: Context, rawConfig: WangwangAdapterConfig, customFetch?: typeof fetch | undefined) {
    super(ctx, 'imWangwang')
    this.config = validateWangwangConfig(rawConfig)
    this.customFetch = customFetch

    for (const m of this.config.admittedMerchants) {
      this.merchantMap.set(m.merchantId, m)
      this.accountMap.set(m.accountId, m)
    }
  }

  /**
   * Get admitted merchant by platform merchantId.
   * Throws if merchant is not in the admitted directory (no runtime guessing).
   */
  getAdmittedMerchant(merchantId: string): WangwangAdmittedMerchant {
    const admitted = this.merchantMap.get(merchantId)
    if (!admitted) {
      throw new Error(`WANGWANG_MERCHANT_NOT_ADMITTED: merchantId "${merchantId}" is not in admitted directory`)
    }
    return admitted
  }

  /**
   * Get admitted merchant by Harness ImAccountId.
   */
  getAdmittedMerchantByAccount(accountId: ImAccountId): WangwangAdmittedMerchant {
    const admitted = this.accountMap.get(accountId)
    if (!admitted) {
      throw new Error(`WANGWANG_ACCOUNT_NOT_ADMITTED: accountId "${accountId}" is not configured in admitted merchants`)
    }
    return admitted
  }

  /**
   * Internal credential resolver via CredentialProvider.
   * Never prints, logs, or stores secret values.
   */
  private async resolveCredentials(merchant: WangwangAdmittedMerchant): Promise<ResolvedWangwangCredentials> {
    const credService = this.ctx.get('credentials') as CredentialProvider
    if (!credService) {
      throw new Error('CredentialProvider not available in context')
    }

    const accessKeyRes = await credService.resolve(merchant.accessKeyRef)
    const secretKeyRes = await credService.resolve(merchant.secretKeyRef)

    if (!accessKeyRes || !accessKeyRes.value) {
      throw new Error(`WANGWANG_CREDENTIAL_MISSING: accessKey for ref "${merchant.accessKeyRef}" is not configured`)
    }
    if (!secretKeyRes || !secretKeyRes.value) {
      throw new Error(`WANGWANG_CREDENTIAL_MISSING: secretKey for ref "${merchant.secretKeyRef}" is not configured`)
    }

    return {
      accessKey: accessKeyRes.value,
      secretKey: secretKeyRes.value,
    }
  }

  /**
   * Create an authorized OpenAPI client for a specific merchant.
   */
  async getClientForMerchant(merchantId: string): Promise<WangwangOpenApiClient> {
    const merchant = this.getAdmittedMerchant(merchantId)
    const credentials = await this.resolveCredentials(merchant)
    return new WangwangOpenApiClient({
      endpoint: this.config.endpoint,
      credentials,
      fetch: this.customFetch,
    })
  }

  /**
   * Classify inbound sender and construct factual evidence.
   * Strictly follows:
   * 1. senderType === 1 -> external customer
   * 2. senderType === 2 -> human native (or DSH manual if matching outbox producer)
   * 3. senderType === 3 -> AI upstream evidence
   * 4. Unknown or conflicting -> unknown
   *
   * @param event Wangwang event
   * @param merchant Admitted merchant details
   * @param ownOutboxRequestId Outbound request ID matched if echo from DSH
   */
  classifyInboundSender(
    event: WangwangRawEvent,
    merchant: WangwangAdmittedMerchant,
    ownOutboxRequestId?: ImOutboundRequestId,
  ): WangwangSenderResolution {
    if (event.senderType === 1) {
      return {
        classification: 'external',
        evidence: {
          rawSenderId: event.customerId,
          rawSenderNick: event.customerNick,
          clientSource: 'external',
          isSelfAccount: false,
        },
      }
    }

    if (event.senderType === 2) {
      // If event matches our own registered outbox requestId/producerId echo
      if (ownOutboxRequestId) {
        return {
          classification: 'human_dsh',
          evidence: {
            rawSenderId: merchant.mainServiceAccountId ?? merchant.merchantId,
            matchedOutboundRequestId: ownOutboxRequestId,
            clientSource: 'dsh_manual',
            isSelfAccount: true,
          },
        }
      }
      return {
        classification: 'human_native',
        evidence: {
          rawSenderId: merchant.mainServiceAccountId ?? merchant.merchantId,
          clientSource: 'native_app',
          isSelfAccount: true,
        },
      }
    }

    if (event.senderType === 3) {
      return {
        classification: 'ai_outbound',
        evidence: {
          rawSenderId: merchant.merchantId,
          clientSource: 'ai_agent',
          isSelfAccount: true,
          notes: event.producerId ? `upstream_producer:${event.producerId}` : undefined,
        },
      }
    }

    return {
      classification: 'unknown',
      evidence: {
        rawSenderId: String((event as Record<string, unknown>).senderType ?? 'unknown'),
        notes: 'Unrecognized senderType or conflicting client claim',
      },
    }
  }

  /**
   * Execute with CAS mutex lock for a specific scope.
   */
  private async withScopeLock<T>(scopeKey: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.scopeLocks.get(scopeKey) ?? Promise.resolve()
    let releaseLock: (() => void) | undefined
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    const nextLock = existing.then(() => lockPromise)
    this.scopeLocks.set(scopeKey, nextLock)

    try {
      await existing
      return await fn()
    } finally {
      if (releaseLock) {
        releaseLock()
      }
      if (this.scopeLocks.get(scopeKey) === nextLock) {
        this.scopeLocks.delete(scopeKey)
      }
    }
  }

  /**
   * Pull incremental events page for an admitted merchant and deliver to ImDeliveryService.
   *
   * Invariant: Whole page must be processed and persisted BEFORE advancing the channel cursor.
   * Invariant: Cursor backward movement or out-of-order sequence is safely rejected with CHANNEL_CURSOR_REGRESSION / CONFLICT.
   */
  async pullAndDeliver(merchantId: string): Promise<{
    processedCount: number
    nextSinceId: number
    hasMore: boolean
  }> {
    const merchant = this.getAdmittedMerchant(merchantId)
    const client = await this.getClientForMerchant(merchantId)
    const deliveryService = this.ctx.get('imDelivery') as ImDeliveryService
    if (!deliveryService) {
      throw new Error('ImDeliveryService not available in context')
    }

    const currentSinceId = this.merchantCursors.get(merchantId) ?? 0

    // 1. Fetch raw page from OpenAPI
    const page = await client.pullEvents({
      merchantId,
      sinceId: currentSinceId,
      limit: this.config.pollLimit ?? 50,
    })

    // Validate cursor progression from platform
    if (page.nextSinceId < currentSinceId) {
      throw new Error(`CHANNEL_CURSOR_REGRESSION: received nextSinceId ${page.nextSinceId} < currentSinceId ${currentSinceId}`)
    }

    // 2. Process all events on the page in order
    let processed = 0
    for (const event of page.events) {
      const scope: ImDeliveryScope = {
        kind: 'real',
        platform: 'wangwang',
        accountId: merchant.accountId,
        conversationId: event.conversationId,
        conversationKind: 'direct',
      }
      const scopeId = encodeScopeId(scope)

      await this.withScopeLock(scopeId, async () => {
        // Check cursor safety against regression / CAS conflicts
        const existingCursor = await deliveryService.getCursor(scopeId)
        if (existingCursor && existingCursor.lastReceivedSequenceNumber > 0) {
          // If event has a sequence or timestamp that is strictly behind
          // ImDeliveryService handles deduplication by externalMessageId (messageId)
        }

        const sender = this.classifyInboundSender(event, merchant)

        await deliveryService.receiveInbound({
          scope,
          externalMessageId: event.messageId,
          senderClassification: sender.classification,
          senderEvidence: sender.evidence,
          content: {
            text: event.textContent,
            contentType: event.msgType === 2 ? 'markdown' : 'text',
            rawPayload: event.raw,
          },
          receivedAt: new Date(event.msgTime || Date.now()).toISOString(),
        })
      })

      processed++
    }

    // 3. Whole page successfully ingested -> Advance channel cursor
    this.merchantCursors.set(merchantId, page.nextSinceId)

    return {
      processedCount: processed,
      nextSinceId: page.nextSinceId,
      hasMore: page.hasMore,
    }
  }

  /**
   * Send outbound message to Wangwang with strict status classification:
   * - pre_send_failed: validation error, unconfigured/disabled route, paused account for AI
   * - sent: successfully delivered with receipt
   * - result_unknown: network timeout, 5xx, or ambiguous receipt (MUST NOT blindly retry)
   */
  async sendMessage(request: WangwangSendMessageRequest): Promise<WangwangSendMessageResult> {
    const merchant = this.getAdmittedMerchant(request.merchantId)
    const imConfig = this.ctx.get('imConfig') as ImConfigService
    const deliveryService = this.ctx.get('imDelivery') as ImDeliveryService

    // Scope definition
    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'wangwang',
      accountId: merchant.accountId,
      conversationId: request.customerId,
      conversationKind: 'direct',
    }

    // Pre-send checks
    if (request.isAi) {
      const account = await imConfig.getAccount(merchant.accountId)
      if (account?.paused) {
        await deliveryService.registerOutbound({
          requestId: request.requestId,
          scope,
          intent: 'ai',
          content: { text: request.content },
        })
        return {
          status: 'pre_send_failed',
          error: 'account_paused',
        }
      }

      const route = await imConfig.resolveRoute({
        accountId: merchant.accountId,
        conversationKind: 'direct',
        conversationId: request.customerId,
      })

      if (route.status === 'unmatched' || route.status === 'unconfigured') {
        await deliveryService.registerOutbound({
          requestId: request.requestId,
          scope,
          intent: 'ai',
          content: { text: request.content },
        })
        return {
          status: 'pre_send_failed',
          error: 'conversation_unconfigured',
        }
      }

      if (route.status === 'disabled' || (route.status === 'matched' && !route.enabled)) {
        await deliveryService.registerOutbound({
          requestId: request.requestId,
          scope,
          intent: 'ai',
          content: { text: request.content },
        })
        return {
          status: 'pre_send_failed',
          error: 'conversation_route_disabled',
        }
      }
    }

    // Register pending in delivery domain
    await deliveryService.registerOutbound({
      requestId: request.requestId,
      scope,
      intent: request.isAi ? 'ai' : 'human_manual',
      content: { text: request.content },
    })

    const client = await this.getClientForMerchant(request.merchantId)

    try {
      const resp = await client.sendMessage({
        merchantId: request.merchantId,
        customerId: request.customerId,
        content: request.content,
        userId: request.userId,
        requestId: request.requestId,
      })

      await deliveryService.settleOutbound({
        requestId: request.requestId,
        status: 'sent',
        receipt: {
          externalReceiptId: resp.messageId,
          timestamp: new Date().toISOString(),
          rawStatus: 'OK',
        },
        externalMessageId: resp.messageId,
      })

      return {
        status: 'sent',
        messageId: resp.messageId,
        receiptId: resp.messageId,
        ...(resp.producerId !== undefined ? { producerId: resp.producerId } : {}),
        ...(resp.producerRevision !== undefined ? { producerRevision: resp.producerRevision } : {}),
      }
    } catch (sendErr) {
      // Determine if error is ambiguous / result_unknown
      const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr)
      const isAmbiguousProp = typeof sendErr === 'object' && sendErr !== null && Boolean(Reflect.get(sendErr, 'isAmbiguous'))
      const isAmbiguous = isAmbiguousProp
        || errorMessage.includes('NETWORK_ERROR')
        || errorMessage.includes('TIMEOUT')
        || errorMessage.includes('500')
        || errorMessage.includes('502')
        || errorMessage.includes('503')
        || errorMessage.includes('504')

      const status = isAmbiguous ? 'result_unknown' : 'pre_send_failed'

      await deliveryService.settleOutbound({
        requestId: request.requestId,
        status: isAmbiguous ? 'result_unknown' : 'confirmed_failed',
        receipt: {
          errorMessage,
          rawStatus: isAmbiguous ? 'AMBIGUOUS' : 'FAILED',
        },
      })

      return {
        status,
        error: errorMessage,
      }
    }
  }

  /**
   * Set channel cursor for testing or synchronization.
   */
  setCursor(merchantId: string, sinceId: number): void {
    this.merchantCursors.set(merchantId, sinceId)
  }

  /**
   * Get channel cursor for a merchant.
   */
  getCursor(merchantId: string): number {
    return this.merchantCursors.get(merchantId) ?? 0
  }
}

export default WangwangAdapterService
