import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../../src/types.ts'
import {
  ImDeliveryService,
  encodeScopeId,
  type ImOutboundRequestId,
} from '../../src/delivery/index.ts'
import { ImExecutionService } from '../../src/coordination/index.ts'
import {
  ImSimulationService,
  registerSimulationTools,
  type ImSimulationInstanceId,
} from '../../src/simulation/index.ts'

const mockExec = {} as unknown as ToolRunContext

describe('IM simulation transport and workspace tool gating', () => {
  let ctx: Context
  let backend: TestMemoryStorageBackend
  let configService: ImConfigService
  let deliveryService: ImDeliveryService
  let simulationService: ImSimulationService

  const accountId = brandString<ImAccountId>('acc-sim-1')
  const testedWorkspaceId = brandString<WorkspaceId>('ws-tested-agent')
  const simUserWorkspaceId = brandString<WorkspaceId>('ws-sim-user')

  beforeEach(async () => {
    backend = new TestMemoryStorageBackend()
    ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', backend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ImConfigService)
    configService = ctx.imConfig
    await ctx.plugin(ImDeliveryService)
    deliveryService = ctx.imDelivery
    await ctx.plugin(ImExecutionService)
    await ctx.plugin(ImSimulationService)
    simulationService = ctx.imSimulation
    ctx.provide('sessions', {
      flush: vi.fn(async () => true),
    } as unknown as SessionStore)

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Sim Account',
      status: 'connected',
      paused: false,
    })
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-sim-1'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: testedWorkspaceId,
      enabled: true,
    })
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-sim-group'),
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: testedWorkspaceId,
      enabled: true,
      groupTrigger: { mention: true },
    })
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('does not register simulation tools before a workspace target is configured', async () => {
    const dispose = await registerSimulationTools(ctx, simUserWorkspaceId)
    expect(ctx.tools.get('im_sim_create')).toBeUndefined()
    expect(ctx.tools.get('im_sim_stop')).toBeUndefined()
    expect(ctx.tools.get('im_sim_send_as_member')).toBeUndefined()
    expect(ctx.tools.get('im_sim_send_as_managed_human')).toBeUndefined()
    dispose()
    await expect(
      simulationService.createInstance({
        workspaceId: simUserWorkspaceId,
        conversationId: 'conv-unconfigured',
      }),
    ).rejects.toThrow(/not configured/)
  })

  it('registers simulation tools after the workspace selects a configured target', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const dispose = await registerSimulationTools(ctx, simUserWorkspaceId)
    expect(ctx.tools.get('im_sim_create')).toBeDefined()
    expect(ctx.tools.get('im_sim_stop')).toBeDefined()
    dispose()
  })

  it('freezes the creation target after later workspace configuration changes', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
      targetConversationId: 'conv-frozen',
    })
    const instance = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-frozen',
    })
    expect(instance.target.conversationId).toBe('conv-frozen')
    expect(instance.target.accountId).toBe(accountId)
    expect(instance.testedWorkspaceId).toBe(testedWorkspaceId)

    const otherAccountId = brandString<ImAccountId>('acc-sim-2')
    await configService.upsertAccount({
      id: otherAccountId,
      platform: 'wangwang',
      displayName: 'Other Account',
      status: 'connected',
      paused: false,
    })
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-sim-2'),
      accountId: otherAccountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: testedWorkspaceId,
      enabled: true,
      groupTrigger: { everyN: 2 },
    })
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: otherAccountId,
      conversationKind: 'group',
      targetConversationId: 'conv-retargeted',
    })

    const frozen = simulationService.getInstance(instance.instanceId)
    expect(frozen?.target.accountId).toBe(accountId)
    expect(frozen?.target.conversationKind).toBe('direct')
    expect(frozen?.target.conversationId).toBe('conv-frozen')
  })

  it('isolates concurrent simulation instances against the same target', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const first = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-shared-target',
    })
    const second = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-shared-target',
    })
    expect(first.instanceId).not.toBe(second.instanceId)
    expect(encodeScopeId({
      kind: 'sim',
      instanceId: first.instanceId,
      conversationId: first.target.conversationId,
    })).not.toBe(encodeScopeId({
      kind: 'sim',
      instanceId: second.instanceId,
      conversationId: second.target.conversationId,
    }))

    await simulationService.injectMemberMessage({
      instanceId: first.instanceId,
      memberId: 'alice',
      text: 'only in first',
    })
    const firstHistory = await deliveryService.queryHistory({
      scopeId: encodeScopeId({
        kind: 'sim',
        instanceId: first.instanceId,
        conversationId: first.target.conversationId,
      }),
    })
    const secondHistory = await deliveryService.queryHistory({
      scopeId: encodeScopeId({
        kind: 'sim',
        instanceId: second.instanceId,
        conversationId: second.target.conversationId,
      }),
    })
    expect(firstHistory.map(m => m.content.text)).toEqual(['only in first'])
    expect(secondHistory).toEqual([])
  })

  it('treats explicit stop as terminal', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const instanceId = brandString<ImSimulationInstanceId>('sim-stop-1')
    await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-stop',
      instanceId,
    })
    const stopped = await simulationService.stopInstance(instanceId)
    expect(stopped.status).toBe('stopped')
    await expect(
      simulationService.createInstance({
        workspaceId: simUserWorkspaceId,
        conversationId: 'conv-stop',
        instanceId,
      }),
    ).rejects.toThrow(/already exists/)
    await expect(
      simulationService.injectMemberMessage({
        instanceId,
        memberId: 'alice',
        text: 'after stop',
      }),
    ).rejects.toThrow(/stopped/)
    await expect(
      ctx.tools.get('im_send_message')!.execute(
        { scopeId: `sim:${instanceId}:conv-stop`, text: 'agent after stop' },
        mockExec,
      ),
    ).rejects.toThrow(/not running|stopped/)
  })

  it('imports JSONL as query-only history that does not admit inbound', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const instance = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-jsonl',
    })
    const imported = await simulationService.importJsonlHistory({
      instanceId: instance.instanceId,
      jsonl: [
        JSON.stringify({ text: 'old 1', senderNick: 'archive' }),
        JSON.stringify({ text: 'old 2', senderClassification: 'human_dsh' }),
        'not-json',
      ].join('\n'),
    })
    expect(imported.importedCount).toBe(2)
    const scopeId = encodeScopeId({
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
    })
    const history = await deliveryService.queryHistory({ scopeId })
    expect(history).toHaveLength(2)
    expect(history.every(m => m.stage === 'submitted')).toBe(true)

    const steer = vi.fn()
    const result = await ctx.imExecution.admitInbound({
      scopeId,
      agent: {
        steer,
        session: { id: brandString<SessionId>('session-jsonl') } as unknown as Session,
      } as Pick<Agent, 'steer' | 'session'>,
    })
    expect(result.triggered).toBe(false)
    expect(steer).not.toHaveBeenCalled()
  })

  it('settles simulated outbound locally without calling real adapters', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const instance = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-outbound',
    })
    const dingtalk = vi.fn()
    const wangwang = vi.fn()
    ctx.provide('imDingtalk' as never, { sendMessage: dingtalk })
    ctx.provide('imWangwang' as never, { sendMessage: wangwang })

    const scopeId = encodeScopeId({
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
    })
    const result = (await ctx.tools.get('im_send_message')!.execute(
      { scopeId, text: 'agent sim reply' },
      mockExec,
    )) as { status: string; sent: boolean; requestId: string }
    expect(result.status).toBe('sent')
    expect(result.sent).toBe(true)
    expect(dingtalk).not.toHaveBeenCalled()
    expect(wangwang).not.toHaveBeenCalled()
    const outbound = await deliveryService.getOutbound(
      brandString<ImOutboundRequestId>(result.requestId),
    )
    expect(outbound?.status).toBe('sent')
    const history = await deliveryService.queryHistory({ scopeId })
    expect(history.some(m => m.senderClassification === 'ai_outbound' && m.content.text === 'agent sim reply')).toBe(true)
  })

  it('keeps simulation delivery after account-level pause', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })
    const instance = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'conv-pause',
    })
    await configService.pauseAccount(accountId, true)
    const message = await simulationService.injectManagedHumanMessage({
      instanceId: instance.instanceId,
      text: 'human while paused',
      humanNick: 'owner',
    })
    expect(message.senderClassification).toBe('human_dsh')
    const scopeId = encodeScopeId({
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
    })
    const result = (await ctx.tools.get('im_send_message')!.execute(
      { scopeId, text: 'still delivered' },
      mockExec,
    )) as { sent: boolean }
    expect(result.sent).toBe(true)
  })

  it('injects group members and managed-account humans without treating them as AI outbound', async () => {
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'group',
    })
    const instance = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: 'group-sim',
      conversationKind: 'group',
      speakingMembers: ['alice'],
    })
    const member = await simulationService.injectMemberMessage({
      instanceId: instance.instanceId,
      memberId: 'alice',
      memberNick: 'Alice',
      text: '@bot hello',
    })
    expect(member.senderClassification).toBe('external')
    await expect(
      simulationService.injectMemberMessage({
        instanceId: instance.instanceId,
        memberId: 'bob',
        text: 'not admitted',
      }),
    ).rejects.toThrow(/speaking member/)
    const human = await simulationService.injectManagedHumanMessage({
      instanceId: instance.instanceId,
      text: 'owner speaks',
    })
    expect(human.senderClassification).toBe('human_dsh')
    expect(human.senderClassification).not.toBe('ai_outbound')
  })
})
