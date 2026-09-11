/**
 * Host IM config records map onto the GUI snapshot without secrets.
 */
import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  ImAccountId,
  ImAccountMetadata,
  ImRouteRule,
  ImRouteRuleId,
  ImWorkspaceSimulationConfig,
} from '@deepseek-ai/dsh-im-core/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  accountViewFromMetadata,
  createAccountOptions,
  createRouteOptionsFromDraft,
  routeViewFromRule,
  conversationFromHost,
  conversationRecordsFromDelivery,
  snapshotFromHost,
  selectedStreamScope,
  simulationKeyFromConfig,
  workspaceIdForRole,
} from '../src/client/host-snapshot.ts'
import { emptyGuiSnapshot, emptyRouteDraft } from '../src/client/model.ts'

describe('IM Host snapshot mapping', () => {
  it('presents accounts and specific routes without secrets', () => {
    const account: ImAccountMetadata = {
      id: brandString<ImAccountId>('acc-dt'),
      platform: 'dingtalk',
      displayName: '陈小宇',
      credentialRef: brandString<NonNullable<ImAccountMetadata['credentialRef']>>('CRED_DINGTALK_TOKEN'),
      status: 'connected',
      paused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const rule: ImRouteRule = {
      id: brandString<ImRouteRuleId>('route-group'),
      accountId: account.id,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: '度假开发联调群' },
      workspaceId: brandString<WorkspaceId>('ws-tested'),
      enabled: true,
      groupTrigger: { mention: true, fixedIntervalSeconds: 300 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(accountViewFromMetadata(account)).toMatchObject({
      id: 'acc-dt',
      connected: true,
      credentialRef: 'CRED_DINGTALK_TOKEN',
    })
    expect(routeViewFromRule(rule)).toMatchObject({
      scope: 'specific',
      targets: ['度假开发联调群'],
      groupTrigger: { mention: true, everyN: null, intervalMin: 5 },
    })
  })

  it('creates disabled Host routes and maps simulation keys', () => {
    const draft = emptyRouteDraft('acc-dt')
    const created = createRouteOptionsFromDraft('ws-tested', {
      ...draft,
      mention: true,
      intervalEnabled: true,
      intervalMin: '5',
    })
    expect(created.enabled).toBe(false)
    expect(created.groupTrigger).toEqual({ mention: true, fixedIntervalSeconds: 300 })
    const edited = createRouteOptionsFromDraft('ws-tested', {
      ...draft,
      mention: true,
    }, {
      id: 'route-keep',
      workspaceId: 'ws-tested',
      accountId: 'acc-dt',
      conversationKind: 'group',
      scope: 'all',
      targets: [],
      enabled: true,
    })
    expect(edited.id).toBe('route-keep')
    expect(edited.enabled).toBe(true)
    expect(createAccountOptions('dingtalk', '陈小宇', undefined).credentialRef).toBe('DINGTALK_DWS_TOKEN')
    expect(createAccountOptions('wangwang', '旺旺', {
      endpoint: 'https://example.invalid',
      accessKey: 'secret',
      secretKey: 'secret',
    }).credentialRef).toBe('WANGWANG_ACCESS_KEY')
    const snapshot = snapshotFromHost([], [], [], emptyGuiSnapshot().conversation)
    expect(snapshot.accounts).toEqual([])
    const config: ImWorkspaceSimulationConfig = {
      workspaceId: brandString<WorkspaceId>('ws-simuser'),
      targetAccountId: brandString<ImAccountId>('acc-dt'),
      conversationKind: 'group',
      targetConversationId: '度假开发联调群',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(simulationKeyFromConfig(config, [{
      id: 'route-group',
      workspaceId: 'ws-tested',
      accountId: 'acc-dt',
      conversationKind: 'group',
      scope: 'specific',
      targets: ['度假开发联调群'],
      enabled: true,
    }])).toBe('specific:route-group:度假开发联调群')
  })

  it('maps Host inbound and outbound onto the Sidebar stream without treating result_unknown as sent', () => {
    const account: ImAccountMetadata = {
      id: brandString<ImAccountId>('acc-dt'),
      platform: 'dingtalk',
      displayName: '陈小宇',
      status: 'connected',
      paused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const rule: ImRouteRule = {
      id: brandString<ImRouteRuleId>('route-group'),
      accountId: account.id,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: '度假开发联调群' },
      workspaceId: brandString<WorkspaceId>('ws-tested'),
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const inbound = [{
      messageId: 'm1' as never,
      scopeId: 'real:dingtalk:acc-dt:度假开发联调群' as never,
      senderClassification: 'external' as const,
      senderNick: '张伟',
      stage: 'submitted' as const,
      text: '周末发布回滚方案谁来跟？',
      sequenceNumber: 1,
      receivedAt: '2026-01-01T00:00:00.000Z',
    }]
    const outbound = [{
      requestId: 'req-1' as never,
      scopeId: 'real:dingtalk:acc-dt:度假开发联调群' as never,
      intent: 'human_manual' as const,
      text: '已从 DSH 补了一句。',
      status: 'result_unknown' as const,
      createdAt: '2026-01-01T00:00:01.000Z',
    }]
    expect(conversationRecordsFromDelivery(inbound, outbound).map(row => row.outboundStatus ?? row.inboundStage))
      .toEqual(['submitted', 'result_unknown'])
    const conversation = conversationFromHost(
      [account],
      [rule],
      [],
      inbound,
      outbound,
      emptyGuiSnapshot().conversation,
    )
    expect(conversation.panel).toBe('disabled')
    expect(conversation.unconfigured).toBe(false)
    expect(conversation.messages.map(row => row.delivery)).toEqual(['submitted', 'result_unknown'])
  })

  it('maps simulated-user and tested-agent roles onto Host workspaces', () => {
    const account: ImAccountMetadata = {
      id: brandString<ImAccountId>('acc-dt'),
      platform: 'dingtalk',
      displayName: '陈小宇',
      status: 'connected',
      paused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const rule: ImRouteRule = {
      id: brandString<ImRouteRuleId>('route-group'),
      accountId: account.id,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: brandString<WorkspaceId>('ws-tested'),
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const simulation: ImWorkspaceSimulationConfig = {
      workspaceId: brandString<WorkspaceId>('ws-simuser'),
      targetAccountId: account.id,
      conversationKind: 'group',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const scope = {
      kind: 'real' as const,
      platform: 'dingtalk' as const,
      accountId: account.id,
      conversationId: 'gui-all',
      conversationKind: 'group' as const,
    }
    expect(workspaceIdForRole('simuser', [rule], [simulation], scope)).toBe('ws-simuser')
    expect(workspaceIdForRole('tested', [rule], [simulation], scope)).toBe('ws-tested')
    expect(workspaceIdForRole('real', [rule], [simulation], scope)).toBeUndefined()
    expect(workspaceIdForRole('simuser', [rule], [], scope)).toBeUndefined()
    const instance = {
      instanceId: 'sim-1' as never,
      workspaceId: simulation.workspaceId,
      testedWorkspaceId: rule.workspaceId,
      target: {
        accountId: account.id,
        conversationKind: 'group' as const,
        conversationId: 'gui-all',
      },
      status: 'running' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(selectedStreamScope([account], [rule], [simulation], [instance], 'simuser')).toMatchObject({
      kind: 'sim',
      instanceId: 'sim-1',
      conversationId: 'gui-all',
    })
    expect(selectedStreamScope([account], [rule], [simulation], [instance], 'tested')?.kind).toBe('real')
    const simConversation = conversationFromHost(
      [account],
      [rule],
      [simulation],
      [],
      [],
      { ...emptyGuiSnapshot().conversation, role: 'simuser' },
      [instance],
    )
    expect(simConversation.title).toBe('模拟：gui-all')
    expect(simConversation.simulationInstanceId).toBe('sim-1')
  })
})
