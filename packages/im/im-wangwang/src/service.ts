/**
 * Wangwang / QianNiu IM adapter service for DeepSeek Harness.
 *
 * Implements:
 * - Admitted merchant directory resolution (no whoami, no guessing)
 * - CredentialRef resolution via CredentialProvider seam on demand (never stored as plain fields or printed)
 * - Native HMAC-SHA256 signature generation with native crypto
 * - Whole-page pull before durable channel cursor advance, serialized per merchant
 *   so the cursor read -> fetch -> advance cycle never interleaves across concurrent pulls
 * - Monotonic cursor progression & backward rejection via the durable storage domain
 * - Outbound requestId / producerId / receipt tracking
 * - Pre-send failure vs result_unknown distinction (never blindly retry unknown)
 * - Inbound sender classification strictly verified against the durable local outbox
 *   echo index (`sent_echoes`, written only after a send settles as `sent`):
 *   - senderType 1: external customer
 *   - senderType 2: human native (unless matched DSH manual send echo -> human_dsh)
 *   - senderType 3: ai_outbound ONLY when matched to DSH AI outbound evidence, otherwise unknown
 *
 * @module @deepseek-ai/dsh-im-wangwang/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ImDeliveryScope,
  ImOutboundIntent,
} from '@deepseek-ai/dsh-im-core/delivery'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { WangwangOpenApiClient } from './client.ts'
import { WangwangAmbiguousError } from './errors.ts'
import { resolveWangwangSender } from './identity.ts'
import {
  validateWangwangConfig,
  wangwangDomainSpec,
  wangwangSentEchoKey,
  type WangwangChannelCursorRecord,
  type WangwangSentEchoRecord,
} from './spec.ts'
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

/**
 * Wangwang / QianNiu IM adapter service: admitted merchant directory, on-demand
 * credential resolution, durable cursor polling, and outbox-verified sender identity.
 */
export class WangwangAdapterService extends Service {
  static readonly inject = ['credentials', 'storageDomain', 'imDelivery']

  private readonly config: WangwangAdapterConfig
  private readonly merchantMap = new Map<string, WangwangAdmittedMerchant>()
  private readonly accountMap = new Map<ImAccountId, WangwangAdmittedMerchant>()
  private readonly client: WangwangOpenApiClient

  // Dedicated durable storage domain tables, opened in [Service.init].
  private channelCursorsTable?: KvTable<string, WangwangChannelCursorRecord>
  private sentEchoesTable?: KvTable<string, WangwangSentEchoRecord>

  // In-flight mutex per merchant serializing pulls; the map is bounded by the
  // admitted merchant directory size and entries are never deleted.
  private readonly pullLocks = new Map<string, Promise<void>>()

  constructor(ctx: Context, rawConfig: WangwangAdapterConfig, customFetch?: typeof fetch) {
    super(ctx, 'imWangwang')
    this.config = validateWangwangConfig(rawConfig)
    this.client = new WangwangOpenApiClient({
      endpoint: this.config.endpoint,
      ...(customFetch !== undefined ? { fetch: customFetch } : {}),
    })

    for (const m of this.config.admittedMerchants) {
      this.merchantMap.set(m.merchantId, m)
      this.accountMap.set(m.accountId, m)
    }
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(wangwangDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'imWangwang.domainClose')
    this.channelCursorsTable = domain.table('channel_cursors')
    this.sentEchoesTable = domain.table('sent_echoes')
  }

  private requireDomain(): {
    channelCursorsTable: KvTable<string, WangwangChannelCursorRecord>
    sentEchoesTable: KvTable<string, WangwangSentEchoRecord>
  } {
    if (!this.channelCursorsTable || !this.sentEchoesTable) {
      throw new Error('WangwangAdapterService has not initialized storageDomain')
    }
    return {
      channelCursorsTable: this.channelCursorsTable,
      sentEchoesTable: this.sentEchoesTable,
    }
  }

  /**
   * Get admitted merchant by platform merchantId.
   * Throws if merchant is not in the admitted directory (no runtime guessing).
   * @param merchantId - Platform merchant identifier.
   * @returns The admitted merchant record.
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
   * @param accountId - Harness IM account identifier.
   * @returns The admitted merchant record.
   */
  getAdmittedMerchantByAccount(accountId: ImAccountId): WangwangAdmittedMerchant {
    const admitted = this.accountMap.get(accountId)
    if (!admitted) {
      throw new Error(`WANGWANG_ACCOUNT_NOT_ADMITTED: accountId "${accountId}" is not configured in admitted merchants`)
    }
    return admitted
  }

  /**
   * Resolve secret credentials on demand per call via CredentialProvider.
   * Credentials are never stored on instance fields or logged.
   * @param merchant - Admitted merchant whose CredentialRefs are resolved.
   * @returns The resolved access/secret key pair.
   */
  async resolveCredentials(merchant: WangwangAdmittedMerchant): Promise<ResolvedWangwangCredentials> {
    const credService = this.ctx.get('credentials')
    if (!credService) {
      throw new Error('CredentialProvider not available in context')
    }

    const accessKey = (await credService.resolve(merchant.accessKeyRef))?.value
    if (!accessKey) {
      throw new Error(`WANGWANG_CREDENTIAL_MISSING: accessKey for ref "${merchant.accessKeyRef}" is not configured`)
    }
    const secretKey = (await credService.resolve(merchant.secretKeyRef))?.value
    if (!secretKey) {
      throw new Error(`WANGWANG_CREDENTIAL_MISSING: secretKey for ref "${merchant.secretKeyRef}" is not configured`)
    }

    return { accessKey, secretKey }
  }

  /**
   * Resolve inbound sender identity against the durable local outbox echo index.
   * The echo index is the adapter's own durable record of settled DSH sends;
   * upstream senderType claims are only trusted when they agree with it.
   * See {@link resolveWangwangSender} for the classification invariants.
   * @param event - Raw Wangwang event from the OpenAPI events poll.
   * @param merchant - Admitted merchant the event belongs to.
   * @returns Sender classification plus factual evidence.
   */
  resolveSenderWithOutboxEvidence(
    event: WangwangRawEvent,
    merchant: WangwangAdmittedMerchant,
  ): WangwangSenderResolution {
    const { sentEchoesTable } = this.requireDomain()
    const echo = sentEchoesTable.get(wangwangSentEchoKey(merchant.merchantId, event.messageId))
    return resolveWangwangSender(event, merchant, echo)
  }

  /**
   * Get durable channel cursor from persistent domain table.
   * Survives host restarts and crashes.
   * @param merchantId - Platform merchant identifier.
   * @returns The last durably advanced sinceId, or 0 when never pulled.
   */
  getDurableCursor(merchantId: string): number {
    const { channelCursorsTable } = this.requireDomain()
    const record = channelCursorsTable.get(merchantId)
    return record?.sinceId ?? 0
  }

  /**
   * Set durable channel cursor directly in persistent domain table.
   * @param merchantId - Platform merchant identifier.
   * @param sinceId - New cursor position.
   */
  async setDurableCursor(merchantId: string, sinceId: number): Promise<void> {
    const { channelCursorsTable } = this.requireDomain()
    await channelCursorsTable.put(merchantId, {
      merchantId,
      sinceId,
      updatedAt: new Date().toISOString(),
    })
  }

  /**
   * Run `fn` under the per-merchant pull mutex. Concurrent and later pulls
   * queue behind the in-flight one; a rejecting pull never wedges the chain.
   */
  private async withPullLock<T>(merchantId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.pullLocks.get(merchantId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pullLocks.set(merchantId, previous.then(() => current))

    try {
      await previous
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Pull incremental events page for an admitted merchant and deliver to ImDeliveryService.
   *
   * Invariant: the whole pull runs under the per-merchant mutex, so the durable
   * cursor read -> fetch -> advance cycle is atomic against concurrent pulls.
   * Invariant: Whole page must be processed and persisted BEFORE advancing the durable channel cursor.
   * Invariant: Cursor backward movement is safely rejected with CHANNEL_CURSOR_REGRESSION.
   * @param merchantId - Platform merchant identifier.
   * @returns Processed event count, next cursor position, and hasMore flag.
   */
  async pullAndDeliver(merchantId: string): Promise<{
    processedCount: number
    nextSinceId: number
    hasMore: boolean
  }> {
    const merchant = this.getAdmittedMerchant(merchantId)
    const credentials = await this.resolveCredentials(merchant)
    const deliveryService = this.ctx.get('imDelivery')
    if (!deliveryService) {
      throw new Error('ImDeliveryService not available in context')
    }

    return this.withPullLock(merchantId, async () => {
      const currentSinceId = this.getDurableCursor(merchantId)

      // 1. Fetch raw page from OpenAPI
      const page = await this.client.pullEvents({
        merchantId,
        credentials,
        sinceId: currentSinceId,
        limit: this.config.pollLimit,
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

        const sender = this.resolveSenderWithOutboxEvidence(event, merchant)

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

        processed++
      }

      // 3. Whole page successfully ingested -> Advance durable channel cursor in storage domain
      await this.setDurableCursor(merchantId, page.nextSinceId)

      return {
        processedCount: processed,
        nextSinceId: page.nextSinceId,
        hasMore: page.hasMore,
      }
    })
  }

  /**
   * Send outbound message to Wangwang with strict status classification:
   * - pre_send_failed: validation error, unconfigured/disabled route, paused account for AI
   *   (owned by ImDeliveryService.registerOutbound, never duplicated here)
   * - sent: successfully delivered with receipt; a durable local outbox echo
   *   record is written so later inbound echoes classify from local evidence
   * - result_unknown: network timeout, 5xx, or ambiguous receipt (MUST NOT blindly retry)
   * @param request - Outbound send request with account, customer, content, and requestId.
   * @returns The strict send status classification and receipt facts.
   */
  async sendMessage(request: WangwangSendMessageRequest): Promise<WangwangSendMessageResult> {
    const merchant = this.getAdmittedMerchant(request.merchantId)
    const credentials = await this.resolveCredentials(merchant)
    const deliveryService = this.ctx.get('imDelivery')
    if (!deliveryService) {
      throw new Error('ImDeliveryService not available in context')
    }

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'wangwang',
      accountId: merchant.accountId,
      conversationId: request.customerId,
      conversationKind: 'direct',
    }
    const intent: ImOutboundIntent = request.isAi ? 'ai' : 'human_manual'

    // Register first: ImDeliveryService owns pre-send validation and persists
    // pre_send_failed with the concrete reason.
    const registered = await deliveryService.registerOutbound({
      requestId: request.requestId,
      scope,
      intent,
      content: { text: request.content },
    })
    if (registered.status === 'pre_send_failed') {
      return {
        status: 'pre_send_failed',
        error: registered.preSendFailureReason ?? 'pre_send_failed',
      }
    }

    try {
      const resp = await this.client.sendMessage({
        merchantId: request.merchantId,
        credentials,
        customerId: request.customerId,
        content: request.content,
        userId: request.userId,
        requestId: request.requestId,
      })

      const settledAt = new Date().toISOString()
      await deliveryService.settleOutbound({
        requestId: request.requestId,
        status: 'sent',
        receipt: {
          externalReceiptId: resp.messageId,
          timestamp: settledAt,
          rawStatus: 'OK',
        },
        externalMessageId: resp.messageId,
      })

      // Durable local outbox echo evidence for inbound sender resolution.
      const { sentEchoesTable } = this.requireDomain()
      await sentEchoesTable.put(wangwangSentEchoKey(request.merchantId, resp.messageId), {
        messageId: resp.messageId,
        merchantId: request.merchantId,
        requestId: request.requestId,
        intent,
        settledAt,
      })

      return {
        status: 'sent',
        messageId: resp.messageId,
        receiptId: resp.messageId,
        ...(resp.producerId !== undefined ? { producerId: resp.producerId } : {}),
        ...(resp.producerRevision !== undefined ? { producerRevision: resp.producerRevision } : {}),
      }
    } catch (sendErr) {
      const isAmbiguous = sendErr instanceof WangwangAmbiguousError
      // WangwangOpenApiClient throws only Error instances (network failures are
      // wrapped in WangwangAmbiguousError at the client boundary).
      const errorMessage = (sendErr as Error).message

      await deliveryService.settleOutbound({
        requestId: request.requestId,
        status: isAmbiguous ? 'result_unknown' : 'confirmed_failed',
        receipt: {
          errorMessage,
          rawStatus: isAmbiguous ? 'AMBIGUOUS' : 'FAILED',
        },
      })

      return {
        status: isAmbiguous ? 'result_unknown' : 'pre_send_failed',
        error: errorMessage,
      }
    }
  }
}

export default WangwangAdapterService
