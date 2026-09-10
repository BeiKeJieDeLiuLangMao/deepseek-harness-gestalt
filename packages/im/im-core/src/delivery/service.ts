/**
 * Service implementation for IM delivery, inbound deduplication, cursor tracking, history query,
 * and outbound lifecycle state management.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { guiInboundViewOf, guiOutboundViewOf } from './gui-views.ts'
import { encodeExternalMessageKey, encodeScopeId } from './scope.ts'
import {
  imDeliveryDomainSpec,
  type ImInboundDedupRecord,
} from './spec.ts'
import type {
  ImConversationCursor,
  ImGuiCancelPendingAiOutboundOptions,
  ImGuiHistoryQueryOptions,
  ImGuiInboundView,
  ImGuiListOutboundOptions,
  ImGuiOutboundView,
  ImGuiRegisterManualOutboundOptions,
  ImHistoryQueryOptions,
  ImMessageId,
  ImOutboundRequestId,
  ImScopeId,
  ListImOutboundOptions,
  InboundMessageRecord,
  MarkSubmittedOptions,
  OutboundMessageRecord,
  ReceiveInboundOptions,
  ReceiveInboundResult,
  RegisterOutboundOptions,
  SettleOutboundOptions,
} from './types.ts'

export { encodeExternalMessageKey, encodeScopeId, escapeScopeComponent, unescapeScopeComponent } from './scope.ts'

/**
 * Service managing IM message delivery, deduplication, cursor progress, and outbound safety.
 */
export class ImDeliveryService extends TypertRemoteService {
  static inject = ['storageDomain', 'imConfig']

  private inboundTable?: KvTable<ImMessageId, InboundMessageRecord>
  private outboundTable?: KvTable<ImOutboundRequestId, OutboundMessageRecord>
  private cursorsTable?: KvTable<ImScopeId, ImConversationCursor>
  private dedupTable?: KvTable<string, ImInboundDedupRecord>

  constructor(ctx: Context) {
    super(ctx, 'imDelivery')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(imDeliveryDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'imDelivery.domainClose')
    this.inboundTable = domain.table('inbound_messages')
    this.outboundTable = domain.table('outbound_messages')
    this.cursorsTable = domain.table('cursors')
    this.dedupTable = domain.table('dedup')
  }

  private requireDomain(): {
    inboundTable: KvTable<ImMessageId, InboundMessageRecord>
    outboundTable: KvTable<ImOutboundRequestId, OutboundMessageRecord>
    cursorsTable: KvTable<ImScopeId, ImConversationCursor>
    dedupTable: KvTable<string, ImInboundDedupRecord>
  } {
    if (!this.inboundTable || !this.outboundTable || !this.cursorsTable || !this.dedupTable) {
      throw new Error('ImDeliveryService has not initialized')
    }
    return {
      inboundTable: this.inboundTable,
      outboundTable: this.outboundTable,
      cursorsTable: this.cursorsTable,
      dedupTable: this.dedupTable,
    }
  }

  /** Reconcile cursor sequence numbers from inbound records after a crash window. */
  private async getOrReconcileCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined> {
    const { inboundTable, cursorsTable } = this.requireDomain()
    const stored = cursorsTable.get(scopeId)
    let maxReceivedSeq = 0
    let lastExternalId = stored?.lastReceivedExternalMessageId
    let unsubmittedCount = 0
    let maxSubmittedSeq = stored?.lastSubmittedSequenceNumber ?? 0

    for (const [, msg] of inboundTable.entries()) {
      if (msg.scopeId !== scopeId) continue
      if (msg.sequenceNumber > maxReceivedSeq) {
        maxReceivedSeq = msg.sequenceNumber
        lastExternalId = msg.externalMessageId
      }
      if (msg.stage === 'received') {
        unsubmittedCount += 1
      } else {
        maxSubmittedSeq = Math.max(maxSubmittedSeq, msg.sequenceNumber)
      }
    }

    if (!stored) {
      if (maxReceivedSeq === 0) return undefined
      const created: ImConversationCursor = {
        scopeId,
        ...(lastExternalId !== undefined ? { lastReceivedExternalMessageId: lastExternalId } : {}),
        lastReceivedSequenceNumber: maxReceivedSeq,
        lastSubmittedSequenceNumber: maxSubmittedSeq,
        lastSentSequenceNumber: 0,
        unsubmittedCount,
        updatedAt: new Date().toISOString(),
      }
      await cursorsTable.put(scopeId, created)
      return created
    }
    if (
      stored.lastReceivedSequenceNumber < maxReceivedSeq ||
      stored.unsubmittedCount !== unsubmittedCount ||
      stored.lastSubmittedSequenceNumber < maxSubmittedSeq
    ) {
      const reconciled: ImConversationCursor = {
        ...stored,
        lastReceivedSequenceNumber: Math.max(stored.lastReceivedSequenceNumber, maxReceivedSeq),
        ...(lastExternalId !== undefined ? { lastReceivedExternalMessageId: lastExternalId } : {}),
        lastSubmittedSequenceNumber: Math.max(stored.lastSubmittedSequenceNumber, maxSubmittedSeq),
        unsubmittedCount,
        updatedAt: new Date().toISOString(),
      }
      await cursorsTable.put(scopeId, reconciled)
      return reconciled
    }

    return stored
  }

  /**
   * Receive an inbound message. Deduplicates on `(scopeId, externalMessageId)`,
   * writes the inbound record before advancing the cursor, and returns the
   * stored record with the reconciled cursor.
   * @param options - Message payload, sender classification, and external ID.
   * @returns ReceiveInboundResult containing deduplication flag, stored record, and updated cursor.
   */
  async receiveInbound(options: ReceiveInboundOptions): Promise<ReceiveInboundResult> {
    const { inboundTable, cursorsTable, dedupTable } = this.requireDomain()
    const scopeId = encodeScopeId(options.scope)
    const dedupKey = encodeExternalMessageKey(scopeId, options.externalMessageId)

    // Check primary deterministic key or secondary dedup table
    const deterministicId = brandString<ImMessageId>(dedupKey)
    let existingMessage = inboundTable.get(deterministicId)
    if (!existingMessage) {
      const existingDedup = dedupTable.get(dedupKey)
      if (existingDedup) {
        existingMessage = inboundTable.get(existingDedup.messageId)
      }
    }

    if (existingMessage) {
      const cursor = await this.getOrReconcileCursor(scopeId)
      return {
        duplicate: true,
        message: existingMessage,
        cursor: cursor as ImConversationCursor,
      }
    }

    const now = options.receivedAt ?? new Date().toISOString()
    const currentCursor = await this.getOrReconcileCursor(scopeId)
    const nextSeq = (currentCursor?.lastReceivedSequenceNumber ?? 0) + 1

    const record: InboundMessageRecord = {
      messageId: deterministicId,
      scopeId,
      externalMessageId: options.externalMessageId,
      senderClassification: options.senderClassification,
      senderEvidence: options.senderEvidence,
      stage: 'received',
      content: options.content,
      sequenceNumber: nextSeq,
      receivedAt: now,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    }

    // Step a: Write inbound message record first with deterministic scopeId::externalMessageId ID
    await inboundTable.put(deterministicId, record)

    // Step b: Write dedup entry
    await dedupTable.put(dedupKey, {
      externalKey: dedupKey,
      messageId: deterministicId,
      scopeId,
      externalMessageId: options.externalMessageId,
      recordedAt: now,
    })

    // Step c: Update cursor
    const updatedCursor: ImConversationCursor = {
      scopeId,
      lastReceivedExternalMessageId: options.externalMessageId,
      lastReceivedSequenceNumber: nextSeq,
      lastSubmittedSequenceNumber: currentCursor?.lastSubmittedSequenceNumber ?? 0,
      lastSentSequenceNumber: currentCursor?.lastSentSequenceNumber ?? 0,
      unsubmittedCount: (currentCursor?.unsubmittedCount ?? 0) + 1,
      updatedAt: now,
    }
    await cursorsTable.put(scopeId, updatedCursor)

    return {
      duplicate: false,
      message: record,
      cursor: updatedCursor,
    }
  }

  /**
   * Mark messages as submitted to the agent workspace / queue.
   * Updates message stage to 'submitted' and advances lastSubmittedSequenceNumber on the cursor.
   *
   * @param options - Scope ID and array of message IDs.
   * @returns Updated cursor.
   */
  async markSubmitted(options: MarkSubmittedOptions): Promise<ImConversationCursor> {
    const { inboundTable, cursorsTable } = this.requireDomain()
    const now = options.submittedAt ?? new Date().toISOString()
    const cursor = cursorsTable.get(options.scopeId)
    if (!cursor) {
      throw new Error(`Cursor not found for scope ${options.scopeId}`)
    }

    let highestSeq = cursor.lastSubmittedSequenceNumber
    let submittedCount = 0

    for (const msgId of options.messageIds) {
      const msg = inboundTable.get(msgId)
      if (msg) {
        if (msg.stage === 'received') {
          await inboundTable.update(msgId, prev => ({
            ...prev,
            stage: 'submitted',
            submittedAt: now,
          }))
          submittedCount += 1
        }
        if (msg.sequenceNumber > highestSeq) {
          highestSeq = msg.sequenceNumber
        }
      }
    }

    const nextUnsubmitted = Math.max(0, cursor.unsubmittedCount - submittedCount)
    const updatedCursor: ImConversationCursor = {
      ...cursor,
      lastSubmittedSequenceNumber: highestSeq,
      unsubmittedCount: nextUnsubmitted,
      updatedAt: now,
    }
    await cursorsTable.put(options.scopeId, updatedCursor)
    return updatedCursor
  }

  /**
   * Get cursor for a given scope.
   * Reconciles cursor if any crash window discrepancy exists.
   * @param scopeId - Branded scope ID.
   * @returns Current cursor or undefined.
   */
  async getCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined> {
    return this.getOrReconcileCursor(scopeId)
  }

  /**
   * Query conversation history within a validated scope.
   * Prevents cross-scope access: only messages belonging to options.scopeId are returned.
   *
   * @param options - Scope ID, limits, pagination criteria, and optional stage filters.
   * @returns Array of message records sorted by sequenceNumber ascending.
   */
  async queryHistory(options: ImHistoryQueryOptions): Promise<InboundMessageRecord[]> {
    const { inboundTable } = this.requireDomain()
    const limit = options.limit ?? 50
    const stages = options.stages ? new Set(options.stages) : undefined

    const matched: InboundMessageRecord[] = []
    for (const [, record] of inboundTable.entries()) {
      if (record.scopeId !== options.scopeId) continue
      if (stages && !stages.has(record.stage)) continue
      if (options.beforeSequenceNumber !== undefined && record.sequenceNumber >= options.beforeSequenceNumber) {
        continue
      }
      if (options.afterSequenceNumber !== undefined && record.sequenceNumber <= options.afterSequenceNumber) {
        continue
      }
      matched.push(record)
    }

    matched.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    if (matched.length > limit) {
      return matched.slice(-limit)
    }
    return matched
  }

  /**
   * Register an outbound request and run pre-send validation.
   * Real AI outbound fails closed when the account is paused or the route is
   * disabled/unconfigured. Human manual and simulation scopes are not blocked.
   * @param options - Request ID, target scope, workspace, intent, and message content.
   * @returns Stored OutboundMessageRecord.
   */
  async registerOutbound(options: RegisterOutboundOptions): Promise<OutboundMessageRecord> {
    const { outboundTable } = this.requireDomain()
    const scopeId = encodeScopeId(options.scope)
    const now = new Date().toISOString()

    let status: OutboundMessageRecord['status'] = 'pending'
    let failureReason: string | undefined

    if (options.scope.kind === 'real' && options.intent === 'ai') {
      const configService = this.ctx.imConfig
      const account = await configService.getAccount(options.scope.accountId)
      if (!account || account.paused) {
        status = 'pre_send_failed'
        failureReason = account ? 'account_paused' : 'account_not_found'
      } else {
        const routeResult = await configService.resolveRoute({
          accountId: options.scope.accountId,
          conversationKind: options.scope.conversationKind ?? 'direct',
          conversationId: options.scope.conversationId,
        })
        if (routeResult.status === 'disabled' || (routeResult.status === 'matched' && !routeResult.enabled)) {
          status = 'pre_send_failed'
          failureReason = 'conversation_route_disabled'
        } else if (routeResult.status === 'unconfigured') {
          status = 'pre_send_failed'
          failureReason = 'conversation_unconfigured'
        }
      }
    }

    const record: OutboundMessageRecord = {
      requestId: options.requestId,
      scopeId,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      intent: options.intent,
      content: options.content,
      status,
      ...(failureReason ? { preSendFailureReason: failureReason } : {}),
      createdAt: now,
      updatedAt: now,
      ...(options.replyToExternalMessageId ? { replyToExternalMessageId: options.replyToExternalMessageId } : {}),
    }

    await outboundTable.put(options.requestId, record)
    return record
  }

  /**
   * Settle an outbound request after external delivery attempt.
   *
   * Invariants:
   * - If status === 'result_unknown': ambiguous receipt, platform state undetermined.
   *   Must NOT automatically retry.
   * - If status === 'sent': mark sent, record receipt.
   * - If status === 'confirmed_failed': terminal failure.
   *
   * @param options - Settle parameters with receipt and final status.
   * @returns Updated OutboundMessageRecord.
   */
  async settleOutbound(options: SettleOutboundOptions): Promise<OutboundMessageRecord> {
    const { outboundTable, cursorsTable } = this.requireDomain()
    const record = outboundTable.get(options.requestId)
    if (!record) {
      throw new Error(`Outbound request ${options.requestId} not found`)
    }

    const now = new Date().toISOString()
    const updated = await outboundTable.update(options.requestId, prev => ({
      ...prev,
      status: options.status,
      ...(options.receipt ? { receipt: options.receipt } : {}),
      updatedAt: now,
    }))

    if (options.status === 'sent') {
      const cursor = cursorsTable.get(record.scopeId)
      if (cursor) {
        await cursorsTable.update(record.scopeId, c => ({
          ...c,
          lastSentSequenceNumber: c.lastSentSequenceNumber + 1,
          updatedAt: now,
        }))
      }
    }

    return updated
  }

  /**
   * Get outbound message record by requestId.
   * @param requestId - Outbound request identifier.
   * @returns The outbound record if found, or undefined.
   */
  async getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined> {
    const { outboundTable } = this.requireDomain()
    return outboundTable.get(requestId)
  }

  /**
   * List outbound records for one scope. Does not flush adapters.
   * @param options - branded conversation scope.
   * @returns outbound records oldest first.
   */
  async listOutbound(options: ListImOutboundOptions): Promise<OutboundMessageRecord[]> {
    const { outboundTable } = this.requireDomain()
    return [...outboundTable.entries()]
      .map(([, record]) => record)
      .filter(record => record.scopeId === options.scopeId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * GUI Remote history: text and sender facts only.
   * @param options - real or simulation conversation scope.
   * @returns inbound rows oldest first.
   */
  @Remote('queryHistory')
  async remoteExportQueryHistory(options: ImGuiHistoryQueryOptions): Promise<ImGuiInboundView[]> {
    return (await this.queryHistory({ scopeId: encodeScopeId(options.scope) })).map(guiInboundViewOf)
  }

  /**
   * GUI Remote outbound list: text and status only. Does not flush adapters.
   * @param options - real or simulation conversation scope.
   * @returns outbound rows oldest first.
   */
  @Remote('listOutbound')
  async remoteExportListOutbound(options: ImGuiListOutboundOptions): Promise<ImGuiOutboundView[]> {
    return (await this.listOutbound({ scopeId: encodeScopeId(options.scope) })).map(guiOutboundViewOf)
  }

  /**
   * GUI Remote manual send: queues `human_manual` outbound; does not flush adapters.
   * @param options - request id, target scope, and text.
   * @returns the queued outbound row.
   */
  @Remote('registerManualOutbound')
  async remoteExportRegisterManualOutbound(
    options: ImGuiRegisterManualOutboundOptions,
  ): Promise<ImGuiOutboundView> {
    return guiOutboundViewOf(await this.registerOutbound({
      requestId: options.requestId,
      scope: options.scope,
      intent: 'human_manual',
      content: { text: options.text },
    }))
  }

  /**
   * Cancel pending AI outbound for one scope. Does not batch-flush on re-enable.
   * @param scopeId - conversation scope.
   * @param reason - pre-send failure reason.
   * @returns cancelled records.
   */
  async cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]> {
    const { outboundTable } = this.requireDomain()
    const cancelled: OutboundMessageRecord[] = []
    const now = new Date().toISOString()
    for (const [id, record] of outboundTable.entries()) {
      if (record.scopeId === scopeId && record.intent === 'ai' && record.status === 'pending') {
        cancelled.push(await outboundTable.update(id, prev => ({
          ...prev,
          status: 'pre_send_failed',
          preSendFailureReason: reason,
          updatedAt: now,
        })))
      }
    }
    return cancelled
  }

  /**
   * GUI Remote cancel of pending AI outbound. Host encodes the scope.
   * @param options - conversation scope and failure reason.
   * @returns cancelled outbound rows.
   */
  @Remote('cancelPendingAiOutbound')
  async remoteExportCancelPendingAiOutbound(
    options: ImGuiCancelPendingAiOutboundOptions,
  ): Promise<ImGuiOutboundView[]> {
    return (await this.cancelPendingAiOutbound(encodeScopeId(options.scope), options.reason))
      .map(guiOutboundViewOf)
  }
}
