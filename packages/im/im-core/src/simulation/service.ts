/**
 * Service implementation for IM simulation transport, instance lifecycle,
 * member/managed-human injection, and JSONL background history import.
 *
 * @module @deepseek-ai/dsh-im-core/simulation/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { guiInboundViewOf } from '../delivery/gui-views.ts'
import {
  type ImDeliveryScope,
  type ImGuiInboundView,
  type ImMessageId,
  type InboundMessageRecord,
  type OutboundMessageRecord,
} from '../delivery/index.ts'
import { registerSimulationTools } from './tools.ts'
import type {
  CreateSimulationInstanceOptions,
  ImGuiCreateSimulationInstanceOptions,
  ImGuiInjectManagedHumanMessageOptions,
  ImGuiInjectMemberMessageOptions,
  ImportJsonlHistoryOptions,
  ImSimulationInstance,
  ImSimulationInstanceId,
  InjectManagedHumanMessageOptions,
  InjectMemberMessageOptions,
} from './types.ts'

/**
 * Service managing IM simulation instances, local bidirectional delivery,
 * and test message injections.
 */
export class ImSimulationService extends TypertRemoteService {
  static inject = ['imConfig', 'imDelivery']

  private instances = new Map<ImSimulationInstanceId, ImSimulationInstance>()
  private readonly agentTools = new Map<Agent, () => void>()
  private readonly agentToolSync = new WeakMap<Agent, number>()

  constructor(ctx: Context) {
    super(ctx, 'imSimulation')
  }

  protected async [Service.init](): Promise<void> {
    this.ctx.inject(['tools', 'agents'], (toolCtx: Context) => {
      const attach = (agent: Agent): void => {
        void this.syncAgentTools(agent)
      }
      this.ctx.on('agent/created', ({ agent }) => { attach(agent) })
      this.ctx.on('agent/disposed', ({ agent }) => { this.dropAgentTools(agent) })
      this.ctx.on('imConfig/simulation-target', (workspaceId) => {
        for (const agent of toolCtx.agents.list()) {
          if (this.workspaceIdForAgent(agent) === workspaceId) attach(agent)
        }
      })
      for (const agent of toolCtx.agents.list()) attach(agent)
    })
  }

  /**
   * Register or drop simulation tools on one Agent according to its workspace
   * simulation target. Tools stay on that Agent's scoped context.
   * @param agent - live Agent whose session cwd maps to a workspace.
   */
  private async syncAgentTools(agent: Agent): Promise<void> {
    const seq = (this.agentToolSync.get(agent) ?? 0) + 1
    this.agentToolSync.set(agent, seq)
    this.dropAgentTools(agent)
    const workspaceId = this.workspaceIdForAgent(agent)
    if (workspaceId === undefined) return
    const dispose = await registerSimulationTools(agent.ctx, workspaceId, this.ctx)
    if (this.agentToolSync.get(agent) !== seq) {
      dispose()
      return
    }
    this.agentTools.set(agent, dispose)
  }

  /**
   * Map one Agent session cwd onto a workspace id.
   * @param agent - live Agent.
   * @returns the matching workspace id, or undefined when cwd is unbound.
   */
  private workspaceIdForAgent(agent: Agent): WorkspaceId | undefined {
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return undefined
    return this.ctx.get('workspaceRegistry')?.list().find(workspace => workspace.path === cwd)?.id
  }

  /**
   * Unregister simulation tools previously attached to one Agent.
   * @param agent - live or disposing Agent.
   */
  private dropAgentTools(agent: Agent): void {
    this.agentTools.get(agent)?.()
    this.agentTools.delete(agent)
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
   * GUI Remote instance list. Workspace filtering stays local.
   * @returns simulation instances in creation order.
   */
  @Remote('listInstances')
  async remoteExportListInstances(): Promise<ImSimulationInstance[]> {
    return this.listInstances()
  }

  /**
   * GUI Remote create. Host fills conversation id from the workspace target.
   * @param options - simulated-user workspace.
   * @returns created simulation instance.
   */
  @Remote('createInstance')
  async remoteExportCreateInstance(
    options: ImGuiCreateSimulationInstanceOptions,
  ): Promise<ImSimulationInstance> {
    const simConfig = await this.ctx.imConfig.getSimulationConfig(options.workspaceId)
    if (!simConfig) {
      throw new Error(
        `Simulation target is not configured for workspace "${options.workspaceId}". Simulation tools are unavailable.`,
      )
    }
    return this.createInstance({
      workspaceId: options.workspaceId,
      conversationId: simConfig.targetConversationId ?? 'gui-all',
    })
  }

  /**
   * GUI Remote member inject. Returns a text-only inbound row.
   * @param options - running instance, member identity, and text.
   * @returns GUI inbound view for the injected member message.
   */
  @Remote('injectMemberMessage')
  async remoteExportInjectMemberMessage(
    options: ImGuiInjectMemberMessageOptions,
  ): Promise<ImGuiInboundView> {
    return guiInboundViewOf(await this.injectMemberMessage(options))
  }

  /**
   * GUI Remote managed-human inject. Returns a text-only inbound row.
   * @param options - running instance and text.
   * @returns GUI inbound view for the injected human_dsh message.
   */
  @Remote('injectManagedHumanMessage')
  async remoteExportInjectManagedHumanMessage(
    options: ImGuiInjectManagedHumanMessageOptions,
  ): Promise<ImGuiInboundView> {
    return guiInboundViewOf(await this.injectManagedHumanMessage(options))
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
  @Remote('stopInstance')
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
