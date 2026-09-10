/**
 * Service implementation for IM simulation transport, instance lifecycle,
 * member/managed-human injection, and JSONL background history import.
 *
 * @module @deepseek-ai/dsh-im-core/simulation/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  type ImDeliveryScope,
  type ImMessageId,
  type InboundMessageRecord,
  type OutboundMessageRecord,
} from '../delivery/index.ts'
import type {
  CreateSimulationInstanceOptions,
  ImportJsonlHistoryOptions,
  ImSimulationInstance,
  ImSimulationInstanceId,
  InjectManagedHumanMessageOptions,
  InjectMemberMessageOptions,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imSimulation: ImSimulationService
  }
}

/**
 * Service managing IM simulation instances, local bidirectional delivery,
 * and test message injections.
 */
export class ImSimulationService extends Service {
  static inject = ['imConfig', 'imDelivery']

  private instances = new Map<ImSimulationInstanceId, ImSimulationInstance>()

  constructor(ctx: Context) {
    super(ctx, 'imSimulation')
  }

  /**
   * Look up a simulation instance by its unique identifier.
   *
   * @param instanceId - Instance identifier.
   * @returns The simulation instance if found, or undefined.
   */
  getInstance(instanceId: ImSimulationInstanceId): ImSimulationInstance | undefined {
    return this.instances.get(instanceId)
  }

  /**
   * List all known simulation instances.
   *
   * @returns Array of simulation instance records.
   */
  listInstances(): ImSimulationInstance[] {
    return Array.from(this.instances.values())
  }

  /**
   * Create a new simulation instance against the workspace's configured simulation target.
   *
   * Invariants:
   * 1. Workspace must have configured simulation target in imConfig; throws if unconfigured.
   * 2. Instance target snapshot (accountId, conversationKind, conversationId) is frozen at creation.
   *    Subsequent changes to workspace simulation config will not alter this instance.
   *
   * @param options - Workspace ID, conversation ID, optional conversation kind, instance ID, and speaking members.
   * @returns Created simulation instance with frozen target snapshot.
   */
  async createInstance(options: CreateSimulationInstanceOptions): Promise<ImSimulationInstance> {
    const simConfig = await this.ctx.imConfig.getSimulationConfig(options.workspaceId)
    if (!simConfig) {
      throw new Error(
        `Simulation target is not configured for workspace "${options.workspaceId}". Simulation tools are unavailable.`,
      )
    }

    const instanceId = options.instanceId ?? brandString<ImSimulationInstanceId>(
      `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    if (this.instances.has(instanceId)) {
      throw new Error(`Simulation instance "${instanceId}" already exists and cannot be recreated`)
    }

    const conversationKind = simConfig.conversationKind
    if (options.conversationKind !== undefined && options.conversationKind !== conversationKind) {
      throw new Error(
        `Simulation instance conversation kind "${options.conversationKind}" does not match the frozen workspace target "${conversationKind}"`,
      )
    }
    const conversationId = options.conversationId
    const rules = await this.ctx.imConfig.listRouteRules()
    const matchingRule = rules.find(
      r =>
        r.accountId === simConfig.targetAccountId
        && r.conversationKind === conversationKind
        && (r.target.kind === 'all'
          || (r.target.kind === 'specific' && r.target.conversationId === conversationId)),
    )
    if (!matchingRule) {
      throw new Error(
        `Cannot create simulation instance: no matching route rule for account ${simConfig.targetAccountId} and conversation ${conversationId}`,
      )
    }

    const now = new Date().toISOString()
    const instance: ImSimulationInstance = {
      instanceId,
      workspaceId: options.workspaceId,
      testedWorkspaceId: matchingRule.workspaceId,
      target: {
        accountId: simConfig.targetAccountId,
        conversationKind,
        conversationId,
      },
      ...(options.speakingMembers ? { speakingMembers: [...options.speakingMembers] } : {}),
      status: 'running',
      createdAt: now,
    }

    this.instances.set(instanceId, instance)
    return instance
  }

  /**
   * Explicitly stop a simulation instance. Stop is terminal; stopped instances cannot be resumed.
   *
   * @param instanceId - Identifier of the instance to stop.
   * @returns Updated simulation instance with status: 'stopped'.
   */
  async stopInstance(instanceId: ImSimulationInstanceId): Promise<ImSimulationInstance> {
    const existing = this.instances.get(instanceId)
    if (!existing) {
      throw new Error(`Simulation instance "${instanceId}" not found`)
    }

    const updated: ImSimulationInstance = {
      ...existing,
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    }
    this.instances.set(instanceId, updated)
    return updated
  }

  /**
   * Inject a message from a speaking group member into the simulation scope.
   *
   * @param options - Target instance ID, member ID, nick, and text content.
   * @returns Inbound message delivery record.
   */
  async injectMemberMessage(options: InjectMemberMessageOptions): Promise<InboundMessageRecord> {
    const instance = this.instances.get(options.instanceId)
    if (!instance) {
      throw new Error(`Simulation instance "${options.instanceId}" not found`)
    }
    if (instance.status === 'stopped') {
      throw new Error(`Simulation instance "${options.instanceId}" is stopped and cannot send or receive messages`)
    }
    if (instance.speakingMembers && !instance.speakingMembers.includes(options.memberId)) {
      throw new Error(
        `Member "${options.memberId}" is not a speaking member of simulation instance "${options.instanceId}"`,
      )
    }

    const externalMessageId = options.externalMessageId ?? `sim-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const scope: ImDeliveryScope = {
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
      conversationKind: instance.target.conversationKind,
    }

    const result = await this.ctx.imDelivery.receiveInbound({
      scope,
      externalMessageId,
      senderClassification: 'external',
      senderEvidence: {
        rawSenderId: options.memberId,
        rawSenderNick: options.memberNick ?? options.memberId,
        clientSource: 'external',
      },
      content: { text: options.text },
    })

    return result.message
  }

  /**
   * Inject a message from the managed account human identity (human_dsh).
   * Invariant: senderClassification is 'human_dsh', never 'ai_outbound'.
   *
   * @param options - Target instance ID, human nick, and text content.
   * @returns Inbound message delivery record.
   */
  async injectManagedHumanMessage(options: InjectManagedHumanMessageOptions): Promise<InboundMessageRecord> {
    const instance = this.instances.get(options.instanceId)
    if (!instance) {
      throw new Error(`Simulation instance "${options.instanceId}" not found`)
    }
    if (instance.status === 'stopped') {
      throw new Error(`Simulation instance "${options.instanceId}" is stopped and cannot send or receive messages`)
    }

    const externalMessageId = options.externalMessageId ?? `sim-human-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const scope: ImDeliveryScope = {
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
      conversationKind: instance.target.conversationKind,
    }

    const result = await this.ctx.imDelivery.receiveInbound({
      scope,
      externalMessageId,
      senderClassification: 'human_dsh',
      senderEvidence: {
        rawSenderNick: options.humanNick ?? 'human',
        clientSource: 'dsh_manual',
        isSelfAccount: true,
      },
      content: { text: options.text },
    })

    return result.message
  }

  /**
   * Import historical background messages from JSONL text.
   *
   * Invariant:
   * Historical messages are immediately marked as submitted.
   * They are queryable via im_query_history, but will NOT trigger admitInbound.
   *
   * @param options - Target instance ID and JSONL text.
   * @returns Count and IDs of imported messages.
   */
  async importJsonlHistory(options: ImportJsonlHistoryOptions): Promise<{ importedCount: number; messageIds: ImMessageId[] }> {
    const instance = this.instances.get(options.instanceId)
    if (!instance) {
      throw new Error(`Simulation instance "${options.instanceId}" not found`)
    }
    if (instance.status === 'stopped') {
      throw new Error(`Simulation instance "${options.instanceId}" is stopped and cannot import history`)
    }

    const lines = options.jsonl.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const scope: ImDeliveryScope = {
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
      conversationKind: instance.target.conversationKind,
    }

    const importedIds: ImMessageId[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      let parsed: {
        text: string
        senderClassification?: 'external' | 'human_native' | 'human_dsh' | 'ai_outbound' | 'unknown'
        senderNick?: string
        senderId?: string
        externalMessageId?: string
        timestamp?: string
      }
      try {
        parsed = JSON.parse(line) as typeof parsed
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        continue
      }
      if (typeof parsed.text !== 'string' || parsed.text.length === 0) continue

      const externalMessageId = parsed.externalMessageId ?? `jsonl-${instance.instanceId}-${i + 1}`
      const receivedAt = parsed.timestamp ?? new Date(Date.now() - (lines.length - i) * 1000).toISOString()

      const inboundRes = await this.ctx.imDelivery.receiveInbound({
        scope,
        externalMessageId,
        senderClassification: parsed.senderClassification ?? 'external',
        senderEvidence: {
          ...(parsed.senderId ? { rawSenderId: parsed.senderId } : {}),
          ...(parsed.senderNick ? { rawSenderNick: parsed.senderNick } : {}),
          clientSource: parsed.senderClassification === 'human_dsh' ? 'dsh_manual' : 'external',
        },
        content: { text: parsed.text },
        receivedAt,
      })

      // Immediately mark as submitted so it is queryable background and NEVER triggers admitInbound
      await this.ctx.imDelivery.markSubmitted({
        scopeId: inboundRes.message.scopeId,
        messageIds: [inboundRes.message.messageId],
        submittedAt: receivedAt,
      })

      importedIds.push(inboundRes.message.messageId)
    }

    return {
      importedCount: importedIds.length,
      messageIds: importedIds,
    }
  }

  /**
   * Settle a simulated outbound message locally and echo it back into the simulation scope.
   *
   * Invariants:
   * 1. If instance is stopped, outbound fails.
   * 2. Outbound is settled to 'sent' via imDelivery.settleOutbound.
   * 3. Message is echoed back to the simulation instance via imDelivery.receiveInbound as ai_outbound.
   * 4. External platform adapters (DingTalk, Wangwang) are NEVER called.
   *
   * @param outbound - Registered outbound message record.
   * @param instanceId - Simulation instance identifier.
   * @param _conversationId - Encoded conversation id from the outbound scope; the frozen instance target is authoritative.
   * @returns Settled outbound message record.
   */
  async handleSimOutbound(
    outbound: OutboundMessageRecord,
    instanceId: string,
    _conversationId: string,
  ): Promise<OutboundMessageRecord> {
    const instance = this.instances.get(brandString<ImSimulationInstanceId>(instanceId))
    if (!instance || instance.status === 'stopped') {
      await this.ctx.imDelivery.settleOutbound({
        requestId: outbound.requestId,
        status: 'confirmed_failed',
        receipt: {
          rawStatus: instance ? 'instance_stopped' : 'instance_not_found',
          errorMessage: instance
            ? `Simulation instance "${instanceId}" is stopped`
            : `Simulation instance "${instanceId}" not found`,
        },
      })
      throw new Error(
        instance
          ? `Simulation instance "${instanceId}" is stopped and cannot send or receive messages`
          : `Simulation instance "${instanceId}" not found`,
      )
    }

    // 1. Settle outbound locally to 'sent'
    const settled = await this.ctx.imDelivery.settleOutbound({
      requestId: outbound.requestId,
      status: 'sent',
      receipt: {
        externalReceiptId: `sim-rcpt-${outbound.requestId}`,
        rawStatus: 'sent',
      },
      externalMessageId: `sim-ext-${outbound.requestId}`,
    })

    // 2. Echo outbound back as ai_outbound to the simulation scope so simulated user can observe it
    const simScope: ImDeliveryScope = {
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
      conversationKind: instance.target.conversationKind,
    }

    await this.ctx.imDelivery.receiveInbound({
      scope: simScope,
      externalMessageId: `sim-echo-${outbound.requestId}`,
      senderClassification: 'ai_outbound',
      senderEvidence: {
        matchedOutboundRequestId: outbound.requestId,
        isSelfAccount: true,
        clientSource: 'ai_agent',
      },
      content: outbound.content,
    })

    return settled
  }
}
