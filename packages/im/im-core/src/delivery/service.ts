/**
 * Service implementation for IM delivery, inbound deduplication, cursor tracking, history query,
 * and outbound lifecycle state management.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import {
  imDeliveryDomainSpec,
  type ImInboundDedupRecord,
} from './spec.ts'
import type {
  ImConversationCursor,
  ImDeliveryScope,
  ImHistoryQueryOptions,
  ImMessageId,
  ImOutboundRequestId,
  ImScopeId,
  InboundMessageRecord,
  MarkSubmittedOptions,
  OutboundMessageRecord,
  ReceiveInboundOptions,
  ReceiveInboundResult,
  RegisterOutboundOptions,
  SettleOutboundOptions,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imDelivery: ImDeliveryService
  }
}

/**
 * Validated scope encoder avoiding delimiter collision via strict component escaping.
 * Escapes `%` -> `%25` and `:` -> `%3A`.
 */
export function escapeScopeComponent(part: string): string {
  return part.replace(/%/g, '%25').replace(/:/g, '%3A')
}

export function unescapeScopeComponent(part: string): string {
  return part.replace(/%3A/g, ':').replace(/%25/g, '%')
}

/**
 * Strictly encode an ImDeliveryScope into an ImScopeId.
 * Guarantees no colon collision across platform, accountId, instanceId, or conversationId.
 */
export function encodeScopeId(scope: ImDeliveryScope): ImScopeId {
  if (scope.kind === 'real') {
    const raw = `real:${escapeScopeComponent(scope.platform)}:${escapeScopeComponent(scope.accountId)}:${escapeScopeComponent(scope.conversationId)}`
    return brandString<ImScopeId>(raw)
  }
  const raw = `sim:${escapeScopeComponent(scope.instanceId)}:${escapeScopeComponent(scope.conversationId)}`
  return brandString<ImScopeId>(raw)
}

/**
 * Strictly encode deduplication key for externalMessageId within a scope.
 */
export function encodeExternalMessageKey(scopeId: ImScopeId, externalMessageId: string): string {
  return `${scopeId}::${escapeScopeComponent(externalMessageId)}`
}

/**
 * Service managing IM message delivery, deduplication, cursor progress, and outbound safety.
 */
export class ImDeliveryService extends Service {
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

  /**
   * Reconcile or retrieve cursor for a scope.
   * If a crash occurred between message write and cursor write,
   * this reconciles cursor state by deriving lastReceivedSequenceNumber,
   * unsubmittedCount, and lastReceivedExternalMessageId directly from inbound records.
   */
  private async getOrReconcileCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined> {
    const { inboundTable, cursorsTable } = this.requireDomain()
    const stored = cursorsTable.get(scopeId)

    // Compute derived ground truth from inbound_messages
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
        lastReceivedExternalMessageId: lastExternalId,
        lastReceivedSequenceNumber: maxReceivedSeq,
        lastSubmittedSequenceNumber: maxSubmittedSeq,
        lastSentSequenceNumber: 0,
        unsubmittedCount,
        updatedAt: new Date().toISOString(),
      }
      await cursorsTable.put(scopeId, created)
      return created
    }

    // If stored cursor lags behind due to a crash window, reconcile it
    if (
      stored.lastReceivedSequenceNumber < maxReceivedSeq ||
      stored.unsubmittedCount !== unsubmittedCount ||
      stored.lastSubmittedSequenceNumber < maxSubmittedSeq
    ) {
      const reconciled: ImConversationCursor = {
        ...stored,
        lastReceivedSequenceNumber: Math.max(stored.lastReceivedSequenceNumber, maxReceivedSeq),
        lastReceivedExternalMessageId: lastExternalId,
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
   * Receive an incoming message from external platform or simulation.
   *
   * Invariants:
   * 1. Check deduplication by (scopeId, externalMessageId) using deterministic key or dedupTable.
   * 2. If already exists, return duplicate = true, the existing record, and reconciled cursor.
   * 3. If new:
   *    a. Write inbound record first with deterministic primary key `scopeId::externalMessageId`.
   *    b. Record dedup entry.
   *    c. Advance cursor and reconcile unsubmittedCount.
   *
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
   * Register an outbound message request and perform pre-send validation.
   *
   * Invariants:
   * 1. If intent === 'ai' and scope is real:
   *    - Check if the account is paused -> pre_send_failed
   *    - Resolve route rule for the conversation:
   *      - If status === 'disabled' or 'unconfigured' -> pre_send_failed (never flush disabled conversations)
   *      - If rule exists but enabled === false -> pre_send_failed
   * 2. If pre-send validation fails, record status: 'pre_send_failed' with reason.
   * 3. Otherwise status: 'pending'.
   * 4. Human manual sends (intent === 'human_manual') are permitted even if account is paused or rule is disabled.
   * 5. Simulation scopes are never blocked by account-level pause or disabled real routes.
   *
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
      // Advance cursor lastSentSequenceNumber if cursor exists
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
   */
  async getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined> {
    const { outboundTable } = this.requireDomain()
    return outboundTable.get(requestId)
  }

  /**
   * List pending outbound AI messages for a specific scope that should be aborted or flushed.
   * Used to ensure disabling conversation cancels pending AI messages without batch flushing on re-enable.
   */
  async cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]> {
    const { outboundTable } = this.requireDomain()
    const cancelled: OutboundMessageRecord[] = []
    const now = new Date().toISOString()

    for (const [id, record] of outboundTable.entries()) {
      if (record.scopeId === scopeId && record.intent === 'ai' && record.status === 'pending') {
        const updated = await outboundTable.update(id, prev => ({
          ...prev,
          status: 'pre_send_failed',
          preSendFailureReason: reason,
          updatedAt: now,
        }))
        cancelled.push(updated)
      }
    }
    return cancelled
  }
}
