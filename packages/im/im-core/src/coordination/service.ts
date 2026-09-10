/**
 * Service implementation for IM execution coordination, group trigger evaluation,
 * safe step boundary preemption, and tool registration.
 *
 * @module @deepseek-ai/dsh-im-core/coordination/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import {
  encodeScopeId,
  type ImMessageId,
  type ImScopeId,
  type InboundMessageRecord,
} from '../delivery/index.ts'
import type { ImConversationKind } from '../types.ts'
import { parseScopeId, registerImTools } from './tools.ts'
import type {
  AdmitInboundOptions,
  AdmitInboundResult,
  ImTriggerReason,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imExecution: ImExecutionService
  }
}

/**
 * Service orchestrating IM inbound message admission, trigger evaluation,
 * and steering into target agent workspace.
 */
export class ImExecutionService extends Service {
  static inject = ['imConfig', 'imDelivery']

  private intervalTrackers = new Map<ImScopeId, { lastTriggeredAt: number }>()

  constructor(ctx: Context) {
    super(ctx, 'imExecution')
  }

  protected async [Service.init](): Promise<void> {
    if (this.ctx.get('tools')) {
      await this.ctx.inject(['tools'], (toolCtx: Context) => {
        toolCtx.effect(() => registerImTools(toolCtx), 'imExecution.tools')
      })
    } else {
      this.ctx.inject(['tools'], (toolCtx: Context) => {
        toolCtx.effect(() => registerImTools(toolCtx), 'imExecution.tools')
      })
    }
  }

  /**
   * Reset the fixed-interval tracking timestamp for a scope.
   *
   * @param scopeId - Conversation scope ID.
   * @param nowMs - Optional current epoch timestamp in milliseconds.
   */
  resetIntervalTracker(scopeId: ImScopeId, nowMs = Date.now()): void {
    this.intervalTrackers.set(scopeId, { lastTriggeredAt: nowMs })
  }

  /**
   * Evaluate trigger conditions and admit inbound messages into the workspace agent context.
   *
   * Invariants:
   * 1. Group trigger OR logic: mention, everyN, fixedInterval.
   * 2. Multiple trigger conditions in the same batch trigger steer exactly once.
   * 3. Message IDs deduplicated; messages sorted by sequenceNumber ascending.
   * 4. ai_outbound messages never trigger and are not counted towards everyN.
   * 5. human_native and human_dsh messages enter context without pausing/disabling.
   * 6. External IM text is never authorized.
   * 7. agent.steer is called first, session flush is awaited, and markSubmitted runs only after success.
   *
   * @param options - Message records, delivery scope, agent, and optional timestamp.
   * @returns Admission outcome with trigger flags and steered message IDs.
   */
  async admitInbound(options: AdmitInboundOptions): Promise<AdmitInboundResult> {
    const incoming: InboundMessageRecord[] = []
    if (options.message) incoming.push(options.message)
    if (options.messages) incoming.push(...options.messages)

    let scopeId = options.scopeId
    if (!scopeId && options.scope) {
      scopeId = encodeScopeId(options.scope)
    }
    if (!scopeId && incoming[0]) {
      scopeId = incoming[0].scopeId
    }
    if (!scopeId) {
      return { triggered: false }
    }

    const parsedScope = parseScopeId(scopeId)
    if (!parsedScope) {
      return { triggered: false }
    }

    // Rule resolution
    let resolvedKind: ImConversationKind = options.scope?.conversationKind ?? 'group'
    let workspaceId = undefined
    let groupTrigger = undefined

    if (parsedScope.kind === 'real') {
      const rules = await this.ctx.imConfig.listRouteRules()
      const matchedRule = rules.find(
        r =>
          r.accountId === parsedScope.accountId &&
          ((r.target.kind === 'specific' && r.target.conversationId === parsedScope.conversationId) ||
            r.target.kind === 'all'),
      )
      if (options.scope?.conversationKind) {
        resolvedKind = options.scope.conversationKind
      } else if (matchedRule) {
        resolvedKind = matchedRule.conversationKind
      }

      const routeResult = await this.ctx.imConfig.resolveRoute({
        accountId: parsedScope.accountId,
        conversationKind: resolvedKind,
        conversationId: parsedScope.conversationId,
      })

      if (routeResult.status !== 'matched') {
        return {
          triggered: false,
          ...(routeResult.status === 'disabled' || routeResult.status === 'account_paused'
            ? { workspaceId: routeResult.workspaceId }
            : {}),
        }
      }

      workspaceId = routeResult.workspaceId
      groupTrigger = routeResult.groupTrigger
    } else {
      // Simulation scope
      resolvedKind = options.scope?.conversationKind ?? 'direct'
    }

    // ai_outbound messages never trigger steer
    if (incoming.length > 0 && incoming.every(m => m.senderClassification === 'ai_outbound')) {
      return { triggered: false, workspaceId }
    }

    let triggerReason: ImTriggerReason | undefined

    const nowMs = options.now !== undefined ? new Date(options.now).getTime() : Date.now()

    if (resolvedKind === 'group') {
      if (!groupTrigger) {
        return { triggered: false, workspaceId }
      }

      // 1. Mention condition
      let mentionTriggered = false
      if (groupTrigger.mention) {
        mentionTriggered = incoming.some((m) => {
          if (m.senderClassification === 'ai_outbound') return false
          const text = m.content.text || ''
          if (text.includes('@bot') || text.includes('@')) return true
          const raw = m.content.rawPayload as Record<string, unknown> | undefined
          if (raw) {
            if (Array.isArray(raw.atUsers) && raw.atUsers.length > 0) return true
            if (raw.isAt) return true
          }
          return false
        })
      }

      // 2. everyN condition (ai_outbound does not count towards everyN)
      let everyNTriggered = false
      if (groupTrigger.everyN !== undefined && groupTrigger.everyN > 0) {
        const unsubmittedHistory = await this.ctx.imDelivery.queryHistory({
          scopeId,
          stages: ['received'],
        })
        // Filter out ai_outbound messages from unsubmitted count
        const nonAiUnsubmitted = unsubmittedHistory.filter(
          m => m.senderClassification !== 'ai_outbound',
        )
        if (nonAiUnsubmitted.length >= groupTrigger.everyN) {
          everyNTriggered = true
        }
      }

      // 3. fixedInterval condition (fixed interval and unsubmittedCount > 0; new messages do not slide/reset)
      let fixedIntervalTriggered = false
      if (
        groupTrigger.fixedIntervalSeconds !== undefined &&
        groupTrigger.fixedIntervalSeconds > 0
      ) {
        const cursor = await this.ctx.imDelivery.getCursor(scopeId)
        const unsubmittedCount = cursor?.unsubmittedCount ?? 0
        if (unsubmittedCount > 0) {
          let tracker = this.intervalTrackers.get(scopeId)
          if (!tracker) {
            tracker = { lastTriggeredAt: nowMs }
            this.intervalTrackers.set(scopeId, tracker)
          }
          const intervalMs = groupTrigger.fixedIntervalSeconds * 1000
          if (nowMs - tracker.lastTriggeredAt >= intervalMs) {
            fixedIntervalTriggered = true
          }
        }
      }

      // Group Trigger OR evaluation
      if (!mentionTriggered && !everyNTriggered && !fixedIntervalTriggered) {
        return { triggered: false, workspaceId }
      }

      if (mentionTriggered) {
        triggerReason = 'mention'
      } else if (everyNTriggered) {
        triggerReason = 'everyN'
      } else {
        triggerReason = 'fixedInterval'
      }
    } else {
      // Direct conversation triggers immediately
      triggerReason = 'direct'
    }

    // Collect all unsubmitted messages to steer
    const unsubmittedHistory = await this.ctx.imDelivery.queryHistory({
      scopeId,
      stages: ['received'],
    })

    const messageMap = new Map<ImMessageId, InboundMessageRecord>()
    for (const msg of unsubmittedHistory) {
      messageMap.set(msg.messageId, msg)
    }
    for (const msg of incoming) {
      messageMap.set(msg.messageId, msg)
    }

    // Filter out ai_outbound from steer context
    const messagesToSubmit = Array.from(messageMap.values())
      .filter(m => m.senderClassification !== 'ai_outbound')
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)

    if (messagesToSubmit.length === 0) {
      return { triggered: false, workspaceId }
    }

    // Format messages into model-visible user message
    const formattedLines = messagesToSubmit.map((m) => {
      const nick = m.senderEvidence?.rawSenderNick
      if (m.senderClassification === 'human_native') {
        return nick ? `[${nick} (human)]: ${m.content.text}` : `[human]: ${m.content.text}`
      }
      if (m.senderClassification === 'human_dsh') {
        return nick ? `[${nick} (DSH)]: ${m.content.text}` : `[DSH]: ${m.content.text}`
      }
      if (m.senderClassification === 'external') {
        return nick ? `[${nick}]: ${m.content.text}` : m.content.text
      }
      return m.content.text
    })
    const steerContentText = formattedLines.join('\n')

    const userMessage = createUserMessage({
      content: [{ type: 'text', text: steerContentText }],
      source: {
        kind: 'im',
        scopeId,
        form: 'notice',
        summary: boundContextSummary('IM inbound'),
      },
    })

    const agent = options.agent
    if (agent) {
      agent.steer(userMessage)

      if (!agent.session) throw new Error('agent.session required to admit IM inbound')
      const sessions = this.ctx.sessions
      if (!sessions) throw new Error('sessions service required before admitting IM inbound')
      const flushed = await sessions.flush(agent.session)
      if (!flushed) throw new Error('session flush did not persist IM inbound')
      await this.ctx.imDelivery.markSubmitted({
        scopeId,
        messageIds: messagesToSubmit.map(m => m.messageId),
        ...(options.now !== undefined ? { submittedAt: new Date(options.now).toISOString() } : {}),
      })

      this.resetIntervalTracker(scopeId, nowMs)
    }

    return {
      triggered: true,
      triggerReason,
      steeredCount: messagesToSubmit.length,
      messageIds: messagesToSubmit.map(m => m.messageId),
      workspaceId,
    }
  }
}
