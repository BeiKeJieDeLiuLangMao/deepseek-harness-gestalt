import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { TestMemoryStorageBackend } from './memory-backend.ts'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImAccountId, ImRouteRuleId } from '../src/types.ts'
import ImConfigServiceDefault, { ImConfigService } from '../src/index.ts'
import {
  imGroupTriggerConfigSchema,
  imRouteRuleRecordSchema,
  credentialRefSchema,
} from '../src/spec.ts'

describe('ImConfigService Seam CRUD & resolveRoute', () => {
  let ctx: Context
  let backend: TestMemoryStorageBackend
  let service: ImConfigService

  beforeEach(async () => {
    backend = new TestMemoryStorageBackend()
    ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', backend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    await ctx.plugin(ImConfigService)
    service = ctx.imConfig
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('allows account CRUD with credential references (no secrets)', async () => {
    expect(service).toBeDefined()

    const accountId = brandString<ImAccountId>('acc-1')

    // Calling methods before service initialization throws
    const uninitCtx = new Context()
    const uninitialized = new ImConfigService(uninitCtx)
    await expect(uninitialized.getAccount(accountId)).rejects.toThrow(/not initialized/)
    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Test DingTalk Account',
      credentialRef: brandString<CredentialRef>('CRED_DINGTALK_TOKEN'),
      status: 'connected',
      paused: false,
      platformMetadata: { corpId: 'corp-123' },
    })

    const account = await service.getAccount(accountId)
    expect(account).toMatchObject({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Test DingTalk Account',
      credentialRef: 'CRED_DINGTALK_TOKEN',
      status: 'connected',
      paused: false,
      platformMetadata: { corpId: 'corp-123' },
    })

    // Update existing account with credentialRef and platformMetadata
    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Test DingTalk Updated',
      credentialRef: brandString<CredentialRef>('CRED_DINGTALK_NEW'),
      platformMetadata: { newKey: 'newVal' },
    })
    const updatedAcc = await service.getAccount(accountId)
    expect(updatedAcc?.displayName).toBe('Test DingTalk Updated')
    expect(updatedAcc?.credentialRef).toBe('CRED_DINGTALK_NEW')
    expect(updatedAcc?.platformMetadata).toEqual({ newKey: 'newVal' })

    // List accounts
    const list = await service.listAccounts()
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(accountId)

    // Pause account
    const paused = await service.pauseAccount(accountId, true)
    expect(paused.paused).toBe(true)
    const fetched = await service.getAccount(accountId)
    expect(fetched?.paused).toBe(true)

    // Pause non-existent account throws
    await expect(
      service.pauseAccount(brandString<ImAccountId>('non-existent'), true),
    ).rejects.toThrow(/not found/)

    // Create a route rule associated with account to test cascade deletion
    const wsId = brandString<WorkspaceId>('ws-cascade')
    const ruleId = brandString<ImRouteRuleId>('rule-cascade')
    await service.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId,
    })
    expect(await service.getRouteRule(ruleId)).toBeDefined()

    // Delete account cascades to associated rules
    // Also test an unrelated rule to verify it remains
    const otherAccId = brandString<ImAccountId>('acc-unrelated')
    await service.upsertAccount({
      id: otherAccId,
      platform: 'wangwang',
      displayName: 'Other',
    })
    const otherRuleId = brandString<ImRouteRuleId>('rule-unrelated')
    await service.createRouteRule({
      id: otherRuleId,
      accountId: otherAccId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId,
    })

    const deleted = await service.deleteAccount(accountId)
    expect(deleted).toBe(true)
    expect(await service.getAccount(accountId)).toBeUndefined()
    expect(await service.listAccounts()).toHaveLength(1)
    expect(await service.getRouteRule(ruleId)).toBeUndefined()
    expect(await service.getRouteRule(otherRuleId)).toBeDefined()

    // Deleting non-existent account returns false
    expect(await service.deleteAccount(accountId)).toBe(false)
  })

  it('resolves routes with specific precedence over all, disabled-specific retention, and pause', async () => {
    const accountId = brandString<ImAccountId>('acc-resolve')
    await service.upsertAccount({
      id: accountId,
      platform: 'wangwang',
      displayName: 'WangWang Shop',
      status: 'connected',
      paused: false,
    })

    const wsGeneral = brandString<WorkspaceId>('ws-general')
    const wsVip = brandString<WorkspaceId>('ws-vip')

    // Rule 1: 'all' direct messages go to ws-general
    const allRuleId = brandString<ImRouteRuleId>('rule-all')
    await service.createRouteRule({
      id: allRuleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsGeneral,
      enabled: true,
    })

    // List rules with filter
    const rulesForGeneral = await service.listRouteRules(wsGeneral)
    expect(rulesForGeneral).toHaveLength(1)
    const rulesForOther = await service.listRouteRules(wsVip)
    expect(rulesForOther).toHaveLength(0)

    // Future/unmapped conversation resolves to 'all' rule
    const res1 = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'buyer-random-123',
    })
    expect(res1).toEqual({
      status: 'matched',
      ruleId: allRuleId,
      workspaceId: wsGeneral,
      enabled: true,
    })

    // Rule 2: 'specific' conversation buyer-vip goes to ws-vip
    const vipRuleId = brandString<ImRouteRuleId>('rule-vip')
    await service.createRouteRule({
      id: vipRuleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'buyer-vip' },
      workspaceId: wsVip,
      enabled: true,
    })

    // Specific rule takes precedence over all rule
    const resVip = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'buyer-vip',
    })
    expect(resVip).toEqual({
      status: 'matched',
      ruleId: vipRuleId,
      workspaceId: wsVip,
      enabled: true,
    })

    // Disabled specific rule: retains binding, does NOT fallback to 'all'
    await service.updateRouteRule(vipRuleId, { enabled: false })
    const resVipDisabled = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'buyer-vip',
    })
    expect(resVipDisabled).toEqual({
      status: 'disabled',
      ruleId: vipRuleId,
      workspaceId: wsVip,
    })

    // Disabled all rule: retains binding as disabled when no specific rule
    await service.updateRouteRule(allRuleId, { enabled: false })
    const resAllDisabled = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'buyer-other',
    })
    expect(resAllDisabled).toEqual({
      status: 'disabled',
      ruleId: allRuleId,
      workspaceId: wsGeneral,
    })

    // Delete rule and delete non-existent rule
    expect(await service.deleteRouteRule(vipRuleId)).toBe(true)
    expect(await service.deleteRouteRule(vipRuleId)).toBe(false)
    expect(await service.getRouteRule(vipRuleId)).toBeUndefined()

    // All group rule
    const allGroupRuleId = brandString<ImRouteRuleId>('rule-all-group')
    await service.createRouteRule({
      id: allGroupRuleId,
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: wsGeneral,
      enabled: false,
      groupTrigger: { mention: true },
    })
    const resAllGroupDisabled = await service.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-unmatched',
    })
    expect(resAllGroupDisabled).toEqual({
      status: 'disabled',
      ruleId: allGroupRuleId,
      workspaceId: wsGeneral,
      groupTrigger: { mention: true },
    })

    // Enable all group rule
    await service.updateRouteRule(allGroupRuleId, { enabled: true })
    const resAllGroupEnabled = await service.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-unmatched',
    })
    expect(resAllGroupEnabled).toEqual({
      status: 'matched',
      ruleId: allGroupRuleId,
      workspaceId: wsGeneral,
      enabled: true,
      groupTrigger: { mention: true },
    })

    // Unmatched conversation for account without rules returns 'unconfigured'
    const unknownAccountId = brandString<ImAccountId>('acc-unknown')
    const resUnmatched = await service.resolveRoute({
      accountId: unknownAccountId,
      conversationKind: 'direct',
      conversationId: 'buyer-vip',
    })
    expect(resUnmatched).toEqual({ status: 'unconfigured' })

    // Account pause on 'all' rule
    await service.pauseAccount(accountId, true)
    const resPaused = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'buyer-random-456',
    })
    expect(resPaused).toEqual({
      status: 'account_paused',
      accountId,
      ruleId: allRuleId,
      workspaceId: wsGeneral,
    })

    // Account with no rules returns unconfigured even when matching account exists
    const accWithoutGroupRules = brandString<ImAccountId>('acc-no-group-rules')
    await service.upsertAccount({
      id: accWithoutGroupRules,
      platform: 'dingtalk',
      displayName: 'No Rules',
      status: 'connected',
      paused: false,
    })
    const resNoRule = await service.resolveRoute({
      accountId: accWithoutGroupRules,
      conversationKind: 'group',
      conversationId: 'buyer-group-no-rule',
    })
    expect(resNoRule).toEqual({ status: 'unconfigured' })

    // When specific rules exist for kind, but none match this conversationId and no 'all' rule
    const specificOnlyAccId = brandString<ImAccountId>('acc-spec-only')
    await service.upsertAccount({
      id: specificOnlyAccId,
      platform: 'dingtalk',
      displayName: 'Spec Only Acc',
      status: 'connected',
      paused: false,
    })
    await service.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-spec-only'),
      accountId: specificOnlyAccId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'c-1' },
      workspaceId: wsGeneral,
    })
    const resSpecUnmatched = await service.resolveRoute({
      accountId: specificOnlyAccId,
      conversationKind: 'direct',
      conversationId: 'c-unmatched',
    })
    expect(resSpecUnmatched).toEqual({ status: 'unconfigured' })

    // Account pause on specific rule with group trigger
    await service.pauseAccount(accountId, false)
    const specificWithTriggerId = brandString<ImRouteRuleId>('rule-spec-trigger')
    await service.createRouteRule({
      id: specificWithTriggerId,
      accountId,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: 'group-paused' },
      workspaceId: wsVip,
      enabled: false,
      groupTrigger: { mention: true },
    })
    const resDisabledWithTrigger = await service.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-paused',
    })
    expect(resDisabledWithTrigger).toEqual({
      status: 'disabled',
      ruleId: specificWithTriggerId,
      workspaceId: wsVip,
      groupTrigger: { mention: true },
    })

    await service.pauseAccount(accountId, true)
    const resPausedSpecific = await service.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-paused',
    })
    expect(resPausedSpecific).toEqual({
      status: 'account_paused',
      accountId,
      ruleId: specificWithTriggerId,
      workspaceId: wsVip,
    })
  })

  it('enforces single workspace per conversation and explicit rebind', async () => {
    const accountId = brandString<ImAccountId>('acc-single-ws')
    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'DingTalk Team',
      status: 'connected',
      paused: false,
    })

    const ws1 = brandString<WorkspaceId>('ws-1')
    const ws2 = brandString<WorkspaceId>('ws-2')
    const rule1Id = brandString<ImRouteRuleId>('rule-dt-1')

    await service.createRouteRule({
      id: rule1Id,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'conv-single' },
      workspaceId: ws1,
      enabled: true,
    })

    // Creating another rule for the same conversation on a different workspace must throw
    const rule2Id = brandString<ImRouteRuleId>('rule-dt-2')
    await expect(
      service.createRouteRule({
        id: rule2Id,
        accountId,
        conversationKind: 'direct',
        target: { kind: 'specific', conversationId: 'conv-single' },
        workspaceId: ws2,
        enabled: true,
      }),
    ).rejects.toThrow(/already bound/)

    // Update non-existent rule throws
    await expect(
      service.updateRouteRule(brandString<ImRouteRuleId>('rule-none'), { enabled: false }),
    ).rejects.toThrow(/not found/)

    // Explicit update/rebind works
    const updated = await service.updateRouteRule(rule1Id, { workspaceId: ws2 })
    expect(updated.workspaceId).toBe(ws2)
    const resolved = await service.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'conv-single',
    })
    expect(resolved).toMatchObject({
      status: 'matched',
      ruleId: rule1Id,
      workspaceId: ws2,
    })
  })

  it('validates group trigger conditions (mention, everyN, fixedInterval, positive numbers, required for group)', async () => {
    const accountId = brandString<ImAccountId>('acc-group')
    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Group Host',
      status: 'connected',
      paused: false,
    })
    const wsGroup = brandString<WorkspaceId>('ws-group')

    // Rule creation with non-existent account must fail
    await expect(
      service.createRouteRule({
        id: brandString<ImRouteRuleId>('g-rule-fail-0'),
        accountId: brandString<ImAccountId>('acc-ghost'),
        conversationKind: 'direct',
        target: { kind: 'all' },
        workspaceId: wsGroup,
      }),
    ).rejects.toThrow(/non-existent account/)

    // Missing trigger on group conversation must fail
    await expect(
      service.createRouteRule({
        id: brandString<ImRouteRuleId>('g-rule-fail-1'),
        accountId,
        conversationKind: 'group',
        target: { kind: 'all' },
        workspaceId: wsGroup,
      }),
    ).rejects.toThrow(/Group trigger configuration is required/)

    // All-empty conditions on group must fail
    await expect(
      service.createRouteRule({
        id: brandString<ImRouteRuleId>('g-rule-fail-2'),
        accountId,
        conversationKind: 'group',
        target: { kind: 'all' },
        workspaceId: wsGroup,
        groupTrigger: { mention: false, everyN: -5 },
      }),
    ).rejects.toThrow(/positive numbers/)

    // Direct message with groupTrigger must fail
    await expect(
      service.createRouteRule({
        id: brandString<ImRouteRuleId>('d-rule-fail'),
        accountId,
        conversationKind: 'direct',
        target: { kind: 'all' },
        workspaceId: wsGroup,
        groupTrigger: { mention: true },
      }),
    ).rejects.toThrow(/not allowed for direct/)

    // Valid combinations: mention + everyN + fixedIntervalSeconds
    const gRuleId = brandString<ImRouteRuleId>('g-rule-ok')
    const rule = await service.createRouteRule({
      id: gRuleId,
      accountId,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: 'cid-group-1' },
      workspaceId: wsGroup,
      groupTrigger: {
        mention: true,
        everyN: 10,
        fixedIntervalSeconds: 300,
      },
    })
    expect(rule.groupTrigger).toEqual({
      mention: true,
      everyN: 10,
      fixedIntervalSeconds: 300,
    })

    // Updating group trigger with invalid condition throws
    await expect(
      service.updateRouteRule(gRuleId, { groupTrigger: { mention: false } }),
    ).rejects.toThrow(/positive numbers/)

    // Updating group trigger with valid condition works
    const updatedRule = await service.updateRouteRule(gRuleId, {
      groupTrigger: { mention: false, everyN: 5 },
    })
    expect(updatedRule.groupTrigger).toEqual({ mention: false, everyN: 5 })

    const resolved = await service.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'cid-group-1',
    })
    expect(resolved).toMatchObject({
      status: 'matched',
      ruleId: gRuleId,
      workspaceId: wsGroup,
      groupTrigger: {
        mention: false,
        everyN: 5,
      },
    })

    // Also test interval-only group trigger
    const updatedRuleInterval = await service.updateRouteRule(gRuleId, {
      groupTrigger: { fixedIntervalSeconds: 120 },
    })
    expect(updatedRuleInterval.groupTrigger).toEqual({ fixedIntervalSeconds: 120 })
  })

  it('restricts simulation target configuration to existing configured accounts', async () => {
    const wsSim = brandString<WorkspaceId>('ws-sim')
    const nonExistentAccount = brandString<ImAccountId>('acc-non-existent')

    // Setting simulation target to unconfigured account must fail
    await expect(
      service.setSimulationConfig({
        workspaceId: wsSim,
        targetAccountId: nonExistentAccount,
        conversationKind: 'direct',
      }),
    ).rejects.toThrow(/does not exist/)

    // Once account and route rule are configured, simulation target is allowed
    const validAccount = brandString<ImAccountId>('acc-sim-valid')
    await service.upsertAccount({
      id: validAccount,
      platform: 'dingtalk',
      displayName: 'Sim Account',
      status: 'connected',
      paused: false,
    })

    // Configure route rules to satisfy simulation target requirement
    await service.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-sim-group'),
      accountId: validAccount,
      conversationKind: 'group',
      target: { kind: 'specific', conversationId: 'group-sim-99' },
      workspaceId: wsSim,
      groupTrigger: { mention: true },
    })
    await service.createRouteRule({
      id: brandString<ImRouteRuleId>('rule-sim-direct'),
      accountId: validAccount,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsSim,
    })

    const simConfig = await service.setSimulationConfig({
      workspaceId: wsSim,
      targetAccountId: validAccount,
      conversationKind: 'group',
      targetConversationId: 'group-sim-99',
    })
    expect(simConfig).toMatchObject({
      workspaceId: wsSim,
      targetAccountId: validAccount,
      conversationKind: 'group',
      targetConversationId: 'group-sim-99',
    })

    const retrieved = await service.getSimulationConfig(wsSim)
    expect(retrieved).toMatchObject(simConfig)

    // Re-set simulation config on same workspace to test update path
    await service.setSimulationConfig({
      workspaceId: wsSim,
      targetAccountId: validAccount,
      conversationKind: 'direct',
    })
    const updatedSim = await service.getSimulationConfig(wsSim)
    expect(updatedSim?.conversationKind).toBe('direct')

    // Deleting simulation config
    const deleted = await service.deleteSimulationConfig(wsSim)
    expect(deleted).toBe(true)
    expect(await service.getSimulationConfig(wsSim)).toBeUndefined()
    expect(await service.deleteSimulationConfig(wsSim)).toBe(false)
  })

  it('proves durable reload through storage reload (atomic coherence & reload round-trip)', async () => {
    const accountId = brandString<ImAccountId>('acc-persisted')
    const ruleId = brandString<ImRouteRuleId>('rule-persisted')
    const wsId = brandString<WorkspaceId>('ws-persisted')

    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Persisted DingTalk',
      status: 'connected',
      paused: false,
    })

    await service.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId,
      enabled: true,
    })

    await service.setSimulationConfig({
      workspaceId: wsId,
      targetAccountId: accountId,
      conversationKind: 'direct',
    })

    // Teardown first context and service
    await ctx.fiber.dispose()

    // Boot fresh second context using the same backend instance to verify durable reload
    const ctx2 = new Context()
    await ctx2.plugin(Storage)
    ctx2.storage.backend.register('memory', backend)
    const facility2 = new DomainFacility(ctx2, { backend: 'memory', routes: {} })
    ctx2.storage.mount('domain', facility2)
    ctx2.provide('storageDomain', facility2)

    await ctx2.plugin(ImConfigService)
    const service2 = ctx2.imConfig

    // Reload check: account, rule, simulation config, and resolveRoute
    const reloadedAccount = await service2.getAccount(accountId)
    expect(reloadedAccount).toMatchObject({
      id: accountId,
      displayName: 'Persisted DingTalk',
    })

    const reloadedRule = await service2.getRouteRule(ruleId)
    expect(reloadedRule).toMatchObject({
      id: ruleId,
      workspaceId: wsId,
      enabled: true,
    })

    const reloadedSim = await service2.getSimulationConfig(wsId)
    expect(reloadedSim).toMatchObject({
      workspaceId: wsId,
      targetAccountId: accountId,
    })

    const reloadedResolved = await service2.resolveRoute({
      accountId,
      conversationKind: 'direct',
      conversationId: 'some-incoming-buyer',
    })
    expect(reloadedResolved).toEqual({
      status: 'matched',
      ruleId,
      workspaceId: wsId,
      enabled: true,
    })

    await ctx2.fiber.dispose()
  })

  it('exercises spec boundary schemas and transforms directly', () => {
    expect(ImConfigServiceDefault).toBe(ImConfigService)
    expect(credentialRefSchema.parse('CRED_TEST')).toBe('CRED_TEST')
    expect(
      imGroupTriggerConfigSchema.safeParse({ mention: false }).success,
    ).toBe(false)
    expect(
      imGroupTriggerConfigSchema.safeParse({ everyN: 5 }).success,
    ).toBe(true)
    expect(
      imGroupTriggerConfigSchema.safeParse({ fixedIntervalSeconds: 60 }).success,
    ).toBe(true)

    const validGroupRule = {
      id: 'rule-g',
      accountId: 'acc-1',
      conversationKind: 'group' as const,
      target: { kind: 'all' as const },
      workspaceId: 'ws-1',
      enabled: true,
      groupTrigger: { mention: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(imRouteRuleRecordSchema.safeParse(validGroupRule).success).toBe(true)

    // Direct with group trigger fails
    const invalidDirect = {
      ...validGroupRule,
      conversationKind: 'direct' as const,
    }
    expect(imRouteRuleRecordSchema.safeParse(invalidDirect).success).toBe(false)
  })

  it('F1: prevents lost updates during concurrent mutations via atomic read-modify-write', async () => {
    const accountId = brandString<ImAccountId>('acc-concurrent')
    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Initial Name',
      paused: false,
    })

    const ruleId = brandString<ImRouteRuleId>('rule-concurrent')
    const wsId1 = brandString<WorkspaceId>('ws-1')
    const wsId2 = brandString<WorkspaceId>('ws-2')

    await service.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'all' },
      workspaceId: wsId1,
      enabled: true,
    })

    // Simulate backend latency to trigger race condition if read-modify-write is not atomic on the table
    backend.putDelayMs = 20

    // Concurrently update route rule: patch enabled to false and patch workspaceId to wsId2
    await Promise.all([
      service.updateRouteRule(ruleId, { enabled: false }),
      service.updateRouteRule(ruleId, { workspaceId: wsId2 }),
    ])

    const finalRule = await service.getRouteRule(ruleId)
    // Both patches must be preserved: enabled === false AND workspaceId === wsId2
    expect(finalRule?.enabled).toBe(false)
    expect(finalRule?.workspaceId).toBe(wsId2)

    // Concurrently pause account and update account displayName via upsertAccount
    await Promise.all([
      service.pauseAccount(accountId, true),
      service.upsertAccount({
        id: accountId,
        platform: 'dingtalk',
        displayName: 'Concurrent Updated Name',
      }),
    ])

    const finalAccount = await service.getAccount(accountId)
    // Both updates must be preserved: paused === true AND displayName === 'Concurrent Updated Name'
    expect(finalAccount?.paused).toBe(true)
    expect(finalAccount?.displayName).toBe('Concurrent Updated Name')

    backend.putDelayMs = 0
  })

  it('F2: concurrent creation of accounts and rules does not orphan records, derives lists from KvTable', async () => {
    const acc1 = brandString<ImAccountId>('acc-race-1')
    const acc2 = brandString<ImAccountId>('acc-race-2')

    backend.putDelayMs = 20

    // Concurrently create two distinct accounts
    await Promise.all([
      service.upsertAccount({ id: acc1, platform: 'dingtalk', displayName: 'Account 1' }),
      service.upsertAccount({ id: acc2, platform: 'wangwang', displayName: 'Account 2' }),
    ])

    const accounts = await service.listAccounts()
    // Both accounts must be listed, neither orphaned due to globalHandle race
    const accountIds = accounts.map(a => a.id).sort()
    expect(accountIds).toEqual([acc1, acc2].sort())

    const rule1 = brandString<ImRouteRuleId>('rule-race-1')
    const rule2 = brandString<ImRouteRuleId>('rule-race-2')
    const ws1 = brandString<WorkspaceId>('ws-race-1')
    const ws2 = brandString<WorkspaceId>('ws-race-2')

    // Concurrently create two distinct rules
    await Promise.all([
      service.createRouteRule({
        id: rule1,
        accountId: acc1,
        conversationKind: 'direct',
        target: { kind: 'all' },
        workspaceId: ws1,
      }),
      service.createRouteRule({
        id: rule2,
        accountId: acc2,
        conversationKind: 'direct',
        target: { kind: 'all' },
        workspaceId: ws2,
      }),
    ])

    const rules = await service.listRouteRules()
    const ruleIds = rules.map(r => r.id).sort()
    expect(ruleIds).toEqual([rule1, rule2].sort())

    // Also reload across context to verify persistence reload reflects both
    backend.putDelayMs = 0
    await ctx.fiber.dispose()

    const ctxReload = new Context()
    await ctxReload.plugin(Storage)
    ctxReload.storage.backend.register('memory', backend)
    const facility = new DomainFacility(ctxReload, { backend: 'memory', routes: {} })
    ctxReload.storage.mount('domain', facility)
    ctxReload.provide('storageDomain', facility)
    await ctxReload.plugin(ImConfigService)
    const serviceReload = ctxReload.imConfig

    const reloadedAccounts = await serviceReload.listAccounts()
    expect(reloadedAccounts.map(a => a.id).sort()).toEqual([acc1, acc2].sort())

    const reloadedRules = await serviceReload.listRouteRules()
    expect(reloadedRules.map(r => r.id).sort()).toEqual([rule1, rule2].sort())

    await ctxReload.fiber.dispose()
  })

  it('F3: rejects simulation target when no matching route rule exists, allows across workspaces and for disabled/paused rules', async () => {
    const wsSim = brandString<WorkspaceId>('ws-sim-user')
    const wsTarget = brandString<WorkspaceId>('ws-target-bot')
    const accountId = brandString<ImAccountId>('acc-sim-test')

    await service.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Sim Account',
      paused: false,
    })

    // Case 1: Account exists, but NO route rule configured for direct conversation
    await expect(
      service.setSimulationConfig({
        workspaceId: wsSim,
        targetAccountId: accountId,
        conversationKind: 'direct',
        targetConversationId: 'conv-direct-1',
      }),
    ).rejects.toThrow(/route/i)

    // Subcase 1b: No targetConversationId specified and no 'all' rule configured
    await expect(
      service.setSimulationConfig({
        workspaceId: wsSim,
        targetAccountId: accountId,
        conversationKind: 'direct',
      }),
    ).rejects.toThrow(/route/i)

    // Configure a specific route rule for direct conversation on wsTarget (another workspace!)
    const ruleDirect = brandString<ImRouteRuleId>('rule-direct-specific')
    await service.createRouteRule({
      id: ruleDirect,
      accountId,
      conversationKind: 'direct',
      target: { kind: 'specific', conversationId: 'conv-direct-1' },
      workspaceId: wsTarget,
      enabled: false, // disabled rule is STILL valid for simulation according to spec
    })

    // Case 2: Specific route rule matches conversationKind & targetConversationId (even though wsTarget != wsSim and rule is disabled)
    const simConfig1 = await service.setSimulationConfig({
      workspaceId: wsSim,
      targetAccountId: accountId,
      conversationKind: 'direct',
      targetConversationId: 'conv-direct-1',
    })
    expect(simConfig1).toMatchObject({
      workspaceId: wsSim,
      targetAccountId: accountId,
      conversationKind: 'direct',
      targetConversationId: 'conv-direct-1',
    })

    // Case 3: Setting target to a different specific conversation that has no rule -> rejected
    await expect(
      service.setSimulationConfig({
        workspaceId: wsSim,
        targetAccountId: accountId,
        conversationKind: 'direct',
        targetConversationId: 'conv-unmatched-2',
      }),
    ).rejects.toThrow(/route/i)

    // Case 4: Group conversation with 'all' rule configured for account
    const ruleGroupAll = brandString<ImRouteRuleId>('rule-group-all')
    await service.createRouteRule({
      id: ruleGroupAll,
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: wsTarget,
      groupTrigger: { mention: true },
      enabled: true,
    })

    // Pause the account to verify paused account rule still allows simulation
    await service.pauseAccount(accountId, true)

    // With 'all' rule, any group conversation matches
    const simConfig2 = await service.setSimulationConfig({
      workspaceId: wsSim,
      targetAccountId: accountId,
      conversationKind: 'group',
      targetConversationId: 'group-any-123',
    })
    expect(simConfig2.conversationKind).toBe('group')
    expect(simConfig2.targetConversationId).toBe('group-any-123')
  })
})
