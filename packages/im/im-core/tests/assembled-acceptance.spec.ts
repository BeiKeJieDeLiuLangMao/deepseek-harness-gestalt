/**
 * Keyless assembled IM takeover scenario: configured account, route, fixture
 * adapter, simulated user, tested agent, and stop isolation. Real model calls,
 * real account reads, and live outbound stay unauthorized.
 */
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
import { TestMemoryStorageBackend } from './memory-backend.ts'
import { ImConfigService } from '../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../src/types.ts'
import { ImDeliveryService, encodeScopeId } from '../src/delivery/index.ts'
import { ImExecutionService } from '../src/coordination/index.ts'
import {
  ImSimulationService,
  registerSimulationTools,
  type ImSimulationInstanceId,
} from '../src/simulation/index.ts'

const mockExec = {} as unknown as ToolRunContext

/** External behaviors this keyless scenario leaves to a separately authorized live lane. */
export const IM_LIVE_LANE_BEHAVIORS = [
  'real DingTalk DWS login and account directory read',
  'real Wangwang endpoint/AK/SK account read',
  'real outbound send to a live conversation',
  'real model calls for agent replies',
  'native Desktop GUI computer-use acceptance of the Sidebar',
] as const

describe('IM takeover keyless assembled acceptance', () => {
  let ctx: Context
  let configService: ImConfigService
  let deliveryService: ImDeliveryService
  let simulationService: ImSimulationService
  let disposeSimTools: () => void
  const dingtalkSend = vi.fn(async () => ({ status: 'sent', openTaskId: 'fixture-dt-1' }))
  const wangwangSend = vi.fn(async () => ({ status: 'sent' }))

  const accountId = brandString<ImAccountId>('acc-assembled')
  const testedWorkspaceId = brandString<WorkspaceId>('ws-tested')
  const simUserWorkspaceId = brandString<WorkspaceId>('ws-simuser')

  beforeEach(async () => {
    const backend = new TestMemoryStorageBackend()
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
    ctx.provide('sessions', { flush: vi.fn(async () => true) } as unknown as SessionStore)
    ctx.provide('imDingtalk' as never, { sendMessage: dingtalkSend })
    ctx.provide('imWangwang' as never, { sendMessage: wangwangSend })

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Assembled DingTalk',
      status: 'connected',
      paused: false,
    })
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-assembled-group'),
      accountId,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: '度假开发联调群' },
      workspaceId: testedWorkspaceId,
      enabled: true,
      groupTrigger: { mention: true },
    })
    await configService.setSimulationConfig({
      workspaceId: simUserWorkspaceId,
      targetAccountId: accountId,
      conversationKind: 'group',
      targetConversationId: '度假开发联调群',
    })
    disposeSimTools = await registerSimulationTools(ctx, simUserWorkspaceId)
  })

  afterEach(async () => {
    disposeSimTools()
    await ctx.fiber.dispose()
    dingtalkSend.mockClear()
    wangwangSend.mockClear()
  })

  it('proves routing, triggers, sender classes, real/sim path parity, and stop isolation', async () => {
    const route = await configService.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: '度假开发联调群',
    })
    expect(route).toMatchObject({
      status: 'matched',
      workspaceId: testedWorkspaceId,
      enabled: true,
      groupTrigger: { mention: true },
    })

    const first = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: '度假开发联调群',
      conversationKind: 'group',
      instanceId: brandString<ImSimulationInstanceId>('sim-one'),
      speakingMembers: ['alice'],
    })
    const second = await simulationService.createInstance({
      workspaceId: simUserWorkspaceId,
      conversationId: '度假开发联调群',
      conversationKind: 'group',
      instanceId: brandString<ImSimulationInstanceId>('sim-two'),
      speakingMembers: ['alice'],
    })
    expect(first.testedWorkspaceId).toBe(testedWorkspaceId)

    const member = await simulationService.injectMemberMessage({
      instanceId: first.instanceId,
      memberId: 'alice',
      memberNick: 'Alice',
      text: '@bot 周末发布回滚方案谁来跟？',
    })
    expect(member.senderClassification).toBe('external')
    const human = await simulationService.injectManagedHumanMessage({
      instanceId: first.instanceId,
      text: '我从 DSH 补一句',
      humanNick: '陈小宇',
    })
    expect(human.senderClassification).toBe('human_dsh')

    const simScopeId = encodeScopeId({
      kind: 'sim',
      instanceId: first.instanceId,
      conversationId: first.target.conversationId,
    })
    const steer = vi.fn()
    const admitted = await ctx.imExecution.admitInbound({
      scopeId: simScopeId,
      message: member,
      agent: {
        steer,
        session: { id: brandString<SessionId>('sess-tested') } as unknown as Session,
      } as Pick<Agent, 'steer' | 'session'>,
    })
    expect(admitted.triggered).toBe(true)
    expect(steer).toHaveBeenCalled()

    const simSend = (await ctx.tools.get('im_send_message')!.execute(
      { scopeId: simScopeId, text: '模拟侧已回复' },
      mockExec,
    )) as { status: string; sent: boolean }
    expect(simSend.status).toBe('sent')
    expect(dingtalkSend).not.toHaveBeenCalled()
    expect(wangwangSend).not.toHaveBeenCalled()

    const realScope = {
      kind: 'real' as const,
      platform: 'dingtalk' as const,
      accountId,
      conversationId: '度假开发联调群',
    }
    await deliveryService.receiveInbound({
      scope: realScope,
      externalMessageId: 'ext-assembled-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderId: 'alice', rawSenderNick: 'Alice', clientSource: 'external' },
      content: { text: '@bot 周末发布回滚方案谁来跟？' },
    })
    const realSend = (await ctx.tools.get('im_send_message')!.execute(
      { scopeId: encodeScopeId(realScope), text: '真实夹具已回复' },
      mockExec,
    )) as { status: string; sent: boolean }
    expect(realSend.status).toBe('sent')
    expect(dingtalkSend).toHaveBeenCalledTimes(1)
    expect(wangwangSend).not.toHaveBeenCalled()

    const stopped = await simulationService.stopInstance(first.instanceId)
    expect(stopped.status).toBe('stopped')
    await expect(
      simulationService.injectMemberMessage({
        instanceId: first.instanceId,
        memberId: 'alice',
        text: 'after stop',
      }),
    ).rejects.toThrow(/stopped/)
    const stillLive = await simulationService.injectMemberMessage({
      instanceId: second.instanceId,
      memberId: 'alice',
      text: 'second instance still running',
    })
    expect(stillLive.senderClassification).toBe('external')
    expect(second.status).toBe('running')

    const simHistory = await deliveryService.queryHistory({ scopeId: simScopeId })
    expect(simHistory.some(m => m.senderClassification === 'external')).toBe(true)
    expect(simHistory.some(m => m.senderClassification === 'human_dsh')).toBe(true)
    expect(simHistory.some(m => m.senderClassification === 'ai_outbound')).toBe(true)
    expect(IM_LIVE_LANE_BEHAVIORS).toHaveLength(5)
  })
})
