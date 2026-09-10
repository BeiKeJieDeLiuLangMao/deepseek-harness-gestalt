import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type {
  ImAccountId,
  ImGroupTriggerConfig,
  ImRouteRuleId,
} from '../../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  encodeScopeId,
} from '../../src/delivery/index.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { ImExecutionService } from '../../src/coordination/index.ts'

function createMockAgent(steer: (msg: UserMessage) => void = vi.fn(), id = 'mock-session'): Pick<Agent, 'steer' | 'session'> {
  return {
    steer,
    session: { id: brandString<SessionId>(id) } as unknown as Session,
  }
}

describe('IM Execution Coordination - Group Trigger OR', () => {
  let ctx: Context
  let backend: TestMemoryStorageBackend
  let configService: ImConfigService
  let deliveryService: ImDeliveryService

  beforeEach(async () => {
    backend = new TestMemoryStorageBackend()
    ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', backend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    await ctx.plugin(ImConfigService)
    configService = ctx.imConfig
    await ctx.plugin(ImDeliveryService)
    deliveryService = ctx.imDelivery
    await ctx.plugin(ImExecutionService)

    ctx.provide('sessions', {
      flush: vi.fn(async () => true),
    } as unknown as SessionStore)
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  async function setupGroup(
    accountIdStr: string,
    workspaceIdStr: string,
    conversationId: string,
    groupTrigger: ImGroupTriggerConfig,
  ): Promise<ImDeliveryScope> {
    const accountId = brandString<ImAccountId>(accountIdStr)
    const workspaceId = brandString<WorkspaceId>(workspaceIdStr)
    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: `Account ${accountIdStr}`,
      status: 'connected',
      paused: false,
    })
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>(`rule-${accountIdStr}`),
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
      groupTrigger,
    })
    return {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'group',
    }
  }

  it('mention triggers steer immediately when unsubmittedCount < everyN', async () => {
    const scope = await setupGroup('acc-dt-1', 'ws-1', 'group-100', {
      mention: true,
      everyN: 5,
    })

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-mention-1',
      senderClassification: 'external',
      senderEvidence: {},
      content: {
        text: '@bot please check order status',
        rawPayload: { atUsers: [{ dingtalkId: 'bot' }] },
      },
    })

    expect(inbound.duplicate).toBe(false)
    expect(inbound.cursor.unsubmittedCount).toBe(1)

    const steerSpy = vi.fn()
    const mockAgent = createMockAgent(steerSpy, 'mock-session')

    const result = await ctx.imExecution.admitInbound({
      message: inbound.message,
      agent: mockAgent,
    })

    expect(result.triggered).toBe(true)
    expect(result.triggerReason).toBe('mention')
    expect(steerSpy).toHaveBeenCalledTimes(1)
  })

  it('everyN triggers steer when unsubmittedCount reaches threshold without mention', async () => {
    const scope = await setupGroup('acc-dt-2', 'ws-2', 'group-200', {
      mention: false,
      everyN: 3,
    })

    const steerSpy = vi.fn()
    const mockAgent = createMockAgent(steerSpy, 'mock-session-2')

    // Msg 1: unsubmittedCount = 1 (< 3)
    const in1 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-m1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Alice' },
      content: { text: 'First chat message' },
    })
    const res1 = await ctx.imExecution.admitInbound({ message: in1.message, agent: mockAgent })
    expect(res1.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // Msg 2: unsubmittedCount = 2 (< 3)
    const in2 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-m2',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Bob' },
      content: { text: 'Second chat message' },
    })
    const res2 = await ctx.imExecution.admitInbound({ message: in2.message, agent: mockAgent })
    expect(res2.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // Msg 3: unsubmittedCount = 3 (>= 3) -> should trigger steer!
    const in3 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-m3',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Charlie' },
      content: { text: 'Third chat message reaching threshold' },
    })
    const res3 = await ctx.imExecution.admitInbound({ message: in3.message, agent: mockAgent })
    expect(res3.triggered).toBe(true)
    expect(res3.triggerReason).toBe('everyN')
    expect(steerSpy).toHaveBeenCalledTimes(1)
    expect(res3.steeredCount).toBe(3)

    // Cursor should now be updated to submitted
    const cursor = await deliveryService.getCursor(in3.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(0)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(3)
  })

  it('fixedInterval triggers only when unsubmittedCount > 0 and new messages do not slide timer', async () => {
    const scope = await setupGroup('acc-dt-3', 'ws-3', 'group-300', {
      fixedIntervalSeconds: 60,
    })

    const steerSpy = vi.fn()
    const mockAgent = createMockAgent(steerSpy, 'mock-session-3')

    const t0 = 1000000000000 // T0

    // Before any message: unsubmittedCount = 0 -> fixedInterval must NOT trigger
    const emptyRes = await ctx.imExecution.admitInbound({
      scope,
      agent: mockAgent,
      now: t0 + 70000,
    })
    expect(emptyRes.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // Msg 1 arrives at T0 + 10s: timer initialized at T0
    ctx.imExecution.resetIntervalTracker(encodeScopeId(scope), t0)
    const in1 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-fi-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Alice' },
      content: { text: 'Hello interval' },
      receivedAt: new Date(t0 + 10000).toISOString(),
    })

    // Check at T0 + 20s: 20s < 60s -> not triggered
    const resEarly = await ctx.imExecution.admitInbound({
      message: in1.message,
      agent: mockAgent,
      now: t0 + 20000,
    })
    expect(resEarly.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // Msg 2 arrives at T0 + 40s ("新消息不滑动重置": does NOT reset interval timer)
    const in2 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-fi-2',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Bob' },
      content: { text: 'Another message' },
      receivedAt: new Date(t0 + 40000).toISOString(),
    })
    const resMid = await ctx.imExecution.admitInbound({
      message: in2.message,
      agent: mockAgent,
      now: t0 + 45000,
    })
    expect(resMid.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // At T0 + 61s: 61s >= 60s from T0 -> triggers steer!
    const resTriggered = await ctx.imExecution.admitInbound({
      scope,
      agent: mockAgent,
      now: t0 + 61000,
    })
    expect(resTriggered.triggered).toBe(true)
    expect(resTriggered.triggerReason).toBe('fixedInterval')
    expect(steerSpy).toHaveBeenCalledTimes(1)
    expect(resTriggered.steeredCount).toBe(2)
  })

  it('overlapping conditions in same batch trigger steer exactly once with deduplication and sequenceNumber order', async () => {
    const scope = await setupGroup('acc-dt-4', 'ws-4', 'group-400', {
      mention: true,
      everyN: 2,
    })

    let steeredMessageContent: UserMessage | undefined
    const steerSpy = vi.fn((msg: UserMessage) => {
      steeredMessageContent = msg
    })
    const mockAgent = createMockAgent(steerSpy, 'mock-session-4')

    const in1 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-overlap-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Alice' },
      content: { text: 'Question 1' },
    })

    const in2 = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-overlap-2',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Bob' },
      content: { text: '@bot urgent request' },
    })

    // Pass batch containing duplicates of message 1 and message 2
    const res = await ctx.imExecution.admitInbound({
      messages: [in2.message, in1.message, in2.message],
      agent: mockAgent,
    })

    // Both mention AND everyN were met, but steer is called exactly ONCE
    expect(res.triggered).toBe(true)
    expect(steerSpy).toHaveBeenCalledTimes(1)
    expect(res.steeredCount).toBe(2)
    expect(res.messageIds).toEqual([in1.message.messageId, in2.message.messageId])

    // Verify sequenceNumber ascending order in steered message
    const firstBlock1 = steeredMessageContent?.content[0]
    expect(firstBlock1?.type === 'text' ? firstBlock1.text : '').toContain('[Alice]: Question 1\n[Bob]: @bot urgent request')
  })

  it('ai_outbound does not trigger steer and does not count towards everyN', async () => {
    const scope = await setupGroup('acc-dt-5', 'ws-5', 'group-500', {
      mention: false,
      everyN: 2,
    })

    const steerSpy = vi.fn()
    const mockAgent = createMockAgent(steerSpy, 'mock-session-5')

    // Receive an ai_outbound message echo
    const inAi = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-ai-echo-1',
      senderClassification: 'ai_outbound',
      senderEvidence: { clientSource: 'ai_agent' },
      content: { text: '@bot I am bot reply' },
    })

    const resAi = await ctx.imExecution.admitInbound({
      message: inAi.message,
      agent: mockAgent,
    })
    expect(resAi.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()

    // Receive 1 external message
    const inExt = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-user-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'David' },
      content: { text: 'Hello' },
    })

    // unsubmittedCount has 1 ai_outbound + 1 external. Non-ai count is 1 (< everyN 2).
    const resExt = await ctx.imExecution.admitInbound({
      message: inExt.message,
      agent: mockAgent,
    })
    // Must NOT trigger because ai_outbound does NOT count towards everyN!
    expect(resExt.triggered).toBe(false)
    expect(steerSpy).not.toHaveBeenCalled()
  })

  it('human_native and human_dsh enter context without auto pausing account or disabling rule', async () => {
    const accountId = brandString<ImAccountId>('acc-dt-6')
    const workspaceId = brandString<WorkspaceId>('ws-6')
    const conversationId = 'group-600'
    const ruleId = brandString<ImRouteRuleId>('rule-group-6')

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'DingTalk Account 6',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
      groupTrigger: {
        mention: true,
      },
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'group',
    }

    let steeredMsg: UserMessage | undefined
    const steerSpy = vi.fn((msg: UserMessage) => {
      steeredMsg = msg
    })
    const mockAgent = createMockAgent(steerSpy, 'mock-session-6')

    // Inbound human_native message
    const inHumanNative = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-human-1',
      senderClassification: 'human_native',
      senderEvidence: { rawSenderNick: 'OwnerBob' },
      content: { text: '@bot I am taking over this task manually' },
    })

    const res = await ctx.imExecution.admitInbound({
      message: inHumanNative.message,
      agent: mockAgent,
    })

    expect(res.triggered).toBe(true)
    expect(steerSpy).toHaveBeenCalledTimes(1)
    const firstBlock2 = steeredMsg?.content[0]
    expect(firstBlock2?.type === 'text' ? firstBlock2.text : '').toContain('[OwnerBob (human)]: @bot I am taking over this task manually')

    // Invariant: human message does NOT automatically pause account or disable rule
    const account = await configService.getAccount(accountId)
    expect(account?.paused).toBe(false)

    const rule = await configService.getRouteRule(ruleId)
    expect(rule?.enabled).toBe(true)
  })
})
