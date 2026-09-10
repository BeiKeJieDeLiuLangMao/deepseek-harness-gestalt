import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
} from '../../src/delivery/index.ts'
import { ImExecutionService } from '../../src/coordination/index.ts'

describe('IM Execution Coordination - Steer & Flush Safety', () => {
  let ctx: Context
  let backend: TestMemoryStorageBackend
  let configService: ImConfigService
  let deliveryService: ImDeliveryService
  let executionService: ImExecutionService

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
    executionService = ctx.imExecution
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('agent.steer failure prevents markSubmitted and leaves cursor unadvanced', async () => {
    const accountId = brandString<ImAccountId>('acc-steer-fail')
    const workspaceId = brandString<WorkspaceId>('ws-steer-fail')
    const conversationId = 'conv-steer-fail'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account Steer Fail',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-steer-fail'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-fail-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Alice' },
      content: { text: 'Direct message' },
    })

    expect(inbound.cursor.unsubmittedCount).toBe(1)

    // Agent whose steer throws an error
    const brokenAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: vi.fn(() => {
        throw new Error('agent.steer transient failure')
      }),
      session: { id: brandString<SessionId>('session-1') } as unknown as Session,
    }

    // Attempt admitInbound - expect failure
    await expect(
      executionService.admitInbound({
        message: inbound.message,
        agent: brokenAgent,
      }),
    ).rejects.toThrow('agent.steer transient failure')

    // Invariant: Progress does not advance when steer fails
    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(1)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(0)

    const history = await deliveryService.queryHistory({
      scopeId: inbound.message.scopeId,
      stages: ['received'],
    })
    expect(history.length).toBe(1)
    expect(history[0]?.stage).toBe('received')
  })

  it('session flush rejection prevents markSubmitted and cursor advancement', async () => {
    const accountId = brandString<ImAccountId>('acc-flush-fail')
    const workspaceId = brandString<WorkspaceId>('ws-flush-fail')
    const conversationId = 'conv-flush-fail'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account Flush Fail',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-flush-fail'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-flush-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Bob' },
      content: { text: 'Direct message 2' },
    })

    // Mount sessions service with a rejecting flush method
    ctx.provide('sessions', {
      flush: vi.fn(async () => {
        throw new Error('disk flush error')
      }),
    } as unknown as SessionStore)

    const steerSpy = vi.fn()
    const mockAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: steerSpy,
      session: { id: brandString<SessionId>('session-flush') } as unknown as Session,
    }

    await expect(
      executionService.admitInbound({
        message: inbound.message,
        agent: mockAgent,
      }),
    ).rejects.toThrow('disk flush error')

    // steer was attempted
    expect(steerSpy).toHaveBeenCalledTimes(1)

    // Invariant: markSubmitted was NOT called because flush failed
    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(1)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(0)
  })

  it('session flush returning false prevents markSubmitted and leaves cursor unadvanced', async () => {
    const accountId = brandString<ImAccountId>('acc-flush-false')
    const workspaceId = brandString<WorkspaceId>('ws-flush-false')
    const conversationId = 'conv-flush-false'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account Flush False',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-flush-false'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-flush-false-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Dave' },
      content: { text: 'Direct message flush false' },
    })

    ctx.provide('sessions', {
      flush: vi.fn(async () => false),
    } as unknown as SessionStore)

    const steerSpy = vi.fn()
    const mockAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: steerSpy,
      session: { id: brandString<SessionId>('session-flush-false') } as unknown as Session,
    }

    await expect(
      executionService.admitInbound({
        message: inbound.message,
        agent: mockAgent,
      }),
    ).rejects.toThrow('session flush did not persist IM inbound')

    expect(steerSpy).toHaveBeenCalledTimes(1)
    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(1)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(0)
  })

  it('missing agent.session throws error and prevents markSubmitted', async () => {
    const accountId = brandString<ImAccountId>('acc-no-session')
    const workspaceId = brandString<WorkspaceId>('ws-no-session')
    const conversationId = 'conv-no-session'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account No Session',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-no-session'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-no-session-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Eve' },
      content: { text: 'Direct message no session' },
    })

    const steerSpy = vi.fn()
    const mockAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: steerSpy,
      session: undefined as unknown as Session,
    }

    await expect(
      executionService.admitInbound({
        message: inbound.message,
        agent: mockAgent,
      }),
    ).rejects.toThrow('agent.session required to admit IM inbound')

    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(1)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(0)
  })

  it('missing sessions service throws error and prevents markSubmitted', async () => {
    const accountId = brandString<ImAccountId>('acc-no-svc')
    const workspaceId = brandString<WorkspaceId>('ws-no-svc')
    const conversationId = 'conv-no-svc'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account No Svc',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-no-svc'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-no-svc-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Frank' },
      content: { text: 'Direct message no svc' },
    })

    const steerSpy = vi.fn()
    const mockAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: steerSpy,
      session: { id: brandString<SessionId>('session-no-svc') } as unknown as Session,
    }

    await expect(
      executionService.admitInbound({
        message: inbound.message,
        agent: mockAgent,
      }),
    ).rejects.toThrow('sessions service required before admitting IM inbound')

    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(1)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(0)
  })

  it('successful steer and flush advance cursor to submitted', async () => {
    const accountId = brandString<ImAccountId>('acc-steer-ok')
    const workspaceId = brandString<WorkspaceId>('ws-steer-ok')
    const conversationId = 'conv-steer-ok'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Account Steer Ok',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-steer-ok'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: true,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
      conversationKind: 'direct',
    }

    const inbound = await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-ok-1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Charlie' },
      content: { text: 'Direct message 3' },
    })

    const flushSpy = vi.fn(async () => true)
    ctx.provide('sessions', { flush: flushSpy } as unknown as SessionStore)

    let steeredMsg: UserMessage | undefined
    const steerSpy = vi.fn((msg: UserMessage) => {
      steeredMsg = msg
    })
    const mockAgent: Pick<Agent, 'steer' | 'session'> = {
      steer: steerSpy,
      session: { id: brandString<SessionId>('session-ok') } as unknown as Session,
    }

    const res = await executionService.admitInbound({
      message: inbound.message,
      agent: mockAgent,
    })

    expect(res.triggered).toBe(true)
    expect(steerSpy).toHaveBeenCalledTimes(1)
    expect(flushSpy).toHaveBeenCalledTimes(1)

    // External IM text is plain user message, never granted authorization credentials
    expect(steeredMsg).toBeDefined()
    if (steeredMsg) {
      expect(steeredMsg.role).toBe('user')
      expect(steeredMsg.source.kind).toBe('im')
    }

    const cursor = await deliveryService.getCursor(inbound.message.scopeId)
    expect(cursor?.unsubmittedCount).toBe(0)
    expect(cursor?.lastSubmittedSequenceNumber).toBe(1)
  })
})
