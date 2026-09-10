import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TestMemoryStorageBackend } from '../memory-backend.ts'
import { ImConfigService } from '../../src/service.ts'
import type { ImAccountId, ImRouteRuleId } from '../../src/types.ts'
import {
  ImDeliveryService,
  type ImDeliveryScope,
  encodeScopeId,
} from '../../src/delivery/index.ts'
import { ImExecutionService } from '../../src/coordination/index.ts'

const mockExec = {} as unknown as ToolRunContext

describe('IM Tools - im_send_message and im_query_history', () => {
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

    // Provide tools service
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)

    await ctx.plugin(ImConfigService)
    configService = ctx.imConfig
    await ctx.plugin(ImDeliveryService)
    deliveryService = ctx.imDelivery
    await ctx.plugin(ImExecutionService)
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('registers im_send_message and im_query_history tools', () => {
    expect(ctx.tools.get('im_send_message')).toBeDefined()
    expect(ctx.tools.get('im_query_history')).toBeDefined()
  })

  it('im_query_history returns message history scoped to conversation', async () => {
    const accountId = brandString<ImAccountId>('acc-query-1')
    const workspaceId = brandString<WorkspaceId>('ws-query-1')
    const conversationId = 'conv-query-1'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Query Account',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-query-1'),
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
    }
    const scopeId = encodeScopeId(scope)

    // Seed 2 inbound messages
    await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-q1',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Alice' },
      content: { text: 'Hello query 1' },
    })
    await deliveryService.receiveInbound({
      scope,
      externalMessageId: 'ext-q2',
      senderClassification: 'external',
      senderEvidence: { rawSenderNick: 'Bob' },
      content: { text: 'Hello query 2' },
    })

    const queryTool = ctx.tools.get('im_query_history')!
    const result = (await queryTool.execute({ scopeId }, mockExec)) as {
      count: number
      messages: { text: string }[]
    }

    expect(result.count).toBe(2)
    expect(result.messages.length).toBe(2)
    expect(result.messages[0]?.text).toBe('Hello query 1')
    expect(result.messages[1]?.text).toBe('Hello query 2')
  })

  it('im_send_message succeeds for enabled real route', async () => {
    const accountId = brandString<ImAccountId>('acc-send-1')
    const workspaceId = brandString<WorkspaceId>('ws-send-1')
    const conversationId = 'conv-send-1'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Send Account',
      status: 'connected',
      paused: false,
    })

    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-send-1'),
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
    }
    const scopeId = encodeScopeId(scope)

    const sendTool = ctx.tools.get('im_send_message')!
    const result = (await sendTool.execute(
      { scopeId, text: 'Agent reply message' },
      mockExec,
    )) as { status: string; scopeId: string }

    expect(result.status).toBe('pending')
    expect(result.scopeId).toBe(scopeId)
  })

  it('im_send_message fails loud when route is disabled or unconfigured', async () => {
    const accountId = brandString<ImAccountId>('acc-send-dis')
    const workspaceId = brandString<WorkspaceId>('ws-send-dis')
    const conversationId = 'conv-send-dis'

    await configService.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Send Account Disabled',
      status: 'connected',
      paused: false,
    })

    // Disabled rule
    await configService.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-send-dis'),
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId,
      enabled: false,
    })

    const scope: ImDeliveryScope = {
      kind: 'real',
      platform: 'dingtalk',
      accountId,
      conversationId,
    }
    const scopeId = encodeScopeId(scope)

    const sendTool = ctx.tools.get('im_send_message')!
    await expect(
      sendTool.execute(
        { scopeId, text: 'Blocked reply' },
        mockExec,
      ),
    ).rejects.toThrow(/pre-send validation failed/)
  })

  it('unconfigured simulation scope fails loud without pretending real delivery', async () => {
    const simScopeId = 'sim:inst-unconfigured:conv-100'

    const sendTool = ctx.tools.get('im_send_message')!

    // Workspace has NO simulation configuration
    await expect(
      sendTool.execute(
        { scopeId: simScopeId, text: 'Fake sim message' },
        mockExec,
      ),
    ).rejects.toThrow(/simulation is not configured/)
  })
})
