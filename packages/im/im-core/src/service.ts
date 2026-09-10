/**
 * Service implementation and Cordis registration for IM domain configuration.
 *
 * @module @deepseek-ai/dsh-im-core/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from 'zod'
import {
  accountNotFound,
  assertGroupTrigger,
  conflictingSpecificRoute,
  hasValidGroupTrigger,
  invalidTrigger,
  routeConflict,
  routeNotFound,
  simulationUnconfigured,
} from './config-errors.ts'
import { imDomainSpec, type ImDomainState } from './spec.ts'
import type {
  CreateImAccountOptions,
  CreateImRouteRuleOptions,
  ImAccountId,
  ImAccountMetadata,
  ImResolveRouteRequest,
  ImResolveRouteResult,
  ImRouteRule,
  ImRouteRuleId,
  ImWorkspaceSimulationConfig,
  SetWorkspaceSimulationTargetOptions,
  UpdateImRouteRuleOptions,
} from './types.ts'

/**
 * IM configuration service managing accounts, route rules, and simulation target binding.
 */
export class ImConfigService extends TypertRemoteService {
  static inject = ['storageDomain']

  private accountsTable?: KvTable<ImAccountId, ImAccountMetadata>
  private rulesTable?: KvTable<ImRouteRuleId, ImRouteRule>
  private simulationsTable?: KvTable<WorkspaceId, ImWorkspaceSimulationConfig>
  private globalHandle?: DomainGlobal<ImDomainState>

  constructor(ctx: Context) {
    super(ctx, 'imConfig')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(imDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'imConfig.domainClose')
    this.accountsTable = domain.table('accounts')
    this.rulesTable = domain.table('rules')
    this.simulationsTable = domain.table('simulations')
    this.globalHandle = domain.global
  }

  private requireDomain(): {
    accountsTable: KvTable<ImAccountId, ImAccountMetadata>
    rulesTable: KvTable<ImRouteRuleId, ImRouteRule>
    simulationsTable: KvTable<WorkspaceId, ImWorkspaceSimulationConfig>
    globalHandle: DomainGlobal<ImDomainState>
  } {
    if (!this.accountsTable || !this.rulesTable || !this.simulationsTable || !this.globalHandle) {
      throw new Error('ImConfigService has not initialized')
    }
    return {
      accountsTable: this.accountsTable,
      rulesTable: this.rulesTable,
      simulationsTable: this.simulationsTable,
      globalHandle: this.globalHandle,
    }
  }

  // --- Account CRUD ---

  /**
   * Look up one IM account by its opaque identifier.
   * @param id - Opaque account identifier.
   * @returns The account metadata if found, or undefined.
   */
  async getAccount(id: ImAccountId): Promise<ImAccountMetadata | undefined> {
    const { accountsTable } = this.requireDomain()
    return accountsTable.get(id)
  }

  /**
   * List all registered IM accounts.
   * @returns Array of registered account metadata records.
   */
  @Remote('listAccounts')
  async listAccounts(): Promise<ImAccountMetadata[]> {
    const { accountsTable } = this.requireDomain()
    return [...accountsTable.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, account]) => account)
  }

  /**
   * Create or update an IM account record.
   * @param options - Account creation/update parameters.
   * @returns The saved account metadata.
   */
  @Remote('upsertAccount')
  async upsertAccount(options: CreateImAccountOptions): Promise<ImAccountMetadata> {
    const { accountsTable } = this.requireDomain()
    const existing = accountsTable.get(options.id)
    const now = new Date().toISOString()

    if (!existing) {
      const metadata: ImAccountMetadata = {
        id: options.id,
        platform: options.platform,
        displayName: options.displayName,
        ...(options.credentialRef !== undefined ? { credentialRef: options.credentialRef } : {}),
        status: options.status ?? 'connected',
        paused: options.paused ?? false,
        ...(options.platformMetadata !== undefined ? { platformMetadata: options.platformMetadata } : {}),
        createdAt: now,
        updatedAt: now,
      }
      await accountsTable.put(options.id, metadata)
      return metadata
    }

    return accountsTable.update(options.id, (current) => {
      const updateNow = new Date().toISOString()
      return {
        ...current,
        platform: options.platform,
        displayName: options.displayName,
        ...(options.credentialRef !== undefined ? { credentialRef: options.credentialRef } : {}),
        status: options.status ?? current.status,
        paused: options.paused ?? current.paused,
        ...(options.platformMetadata !== undefined ? { platformMetadata: options.platformMetadata } : {}),
        updatedAt: updateNow,
      }
    })
  }

  /**
   * Pause or resume an IM account.
   * @param id - Account identifier to update.
   * @param paused - Whether automated handling should be paused.
   * @returns The updated account metadata.
   */
  @Remote('pauseAccount')
  async pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata> {
    const { accountsTable } = this.requireDomain()
    const account = accountsTable.get(id)
    if (!account) {
      throw accountNotFound(id, `IM account not found: ${id}`)
    }
    return accountsTable.update(id, current => ({
      ...current,
      paused,
      updatedAt: new Date().toISOString(),
    }))
  }

  /**
   * Delete an IM account and cascade delete its associated route rules.
   * @param id - Account identifier to delete.
   * @returns True if deleted, false if the account did not exist.
   */
  @Remote('deleteAccount')
  async deleteAccount(id: ImAccountId): Promise<boolean> {
    const { accountsTable, rulesTable } = this.requireDomain()
    const existing = accountsTable.get(id)
    if (!existing) return false
    for (const [ruleId, rule] of rulesTable.entries()) {
      if (rule.accountId === id) {
        await rulesTable.delete(ruleId)
      }
    }

    await accountsTable.delete(id)
    return true
  }

  // --- Route CRUD ---

  /**
   * Look up one route rule by its identifier.
   * @param id - Route rule identifier.
   * @returns The route rule record if found, or undefined.
   */
  async getRouteRule(id: ImRouteRuleId): Promise<ImRouteRule | undefined> {
    const { rulesTable } = this.requireDomain()
    return rulesTable.get(id)
  }

  /**
   * List every route rule for the GUI Remote. Workspace filtering stays local.
   * @returns All saved route rules.
   */
  @Remote('listRouteRules')
  async remoteExportListRouteRules(): Promise<ImRouteRule[]> {
    return this.listRouteRules()
  }

  /**
   * List route rules, optionally filtered by workspace identifier.
   * @param workspaceId - Optional workspace identifier filter.
   * @returns Array of matching route rules.
   */
  async listRouteRules(workspaceId?: WorkspaceId): Promise<ImRouteRule[]> {
    const { rulesTable } = this.requireDomain()
    const rules: ImRouteRule[] = []
    for (const [, rule] of [...rulesTable.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!workspaceId || rule.workspaceId === workspaceId) {
        rules.push(rule)
      }
    }
    return rules
  }

  /**
   * Create or replace a route rule for an account and conversation target.
   * Replacing the same id keeps `createdAt` and updates target, trigger, and enabled.
   * @param options - Route rule definition options.
   * @returns The saved route rule.
   */
  @Remote('createRouteRule')
  async createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule> {
    const { accountsTable, rulesTable } = this.requireDomain()
    const account = accountsTable.get(options.accountId)
    if (!account) {
      throw accountNotFound(
        options.accountId,
        `Cannot bind route rule to non-existent account: ${options.accountId}`,
      )
    }
    assertGroupTrigger(options.conversationKind, options.groupTrigger)
    const allRules = await this.listRouteRules()
    if (options.target.kind === 'specific') {
      const targetConvId = options.target.conversationId
      const conflict = conflictingSpecificRoute(
        allRules,
        options.accountId,
        options.conversationKind,
        targetConvId,
        options.id,
      )
      if (conflict) throw routeConflict(targetConvId, conflict.workspaceId)
    }

    const now = new Date().toISOString()
    const existing = rulesTable.get(options.id)
    const rule: ImRouteRule = {
      id: options.id,
      accountId: options.accountId,
      conversationKind: options.conversationKind,
      target: options.target,
      workspaceId: options.workspaceId,
      enabled: options.enabled ?? true,
      ...(options.groupTrigger !== undefined ? { groupTrigger: options.groupTrigger } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await rulesTable.put(options.id, rule)
    return rule
  }

  /**
   * Update mutable settings of an existing route rule.
   * @param id - Route rule identifier.
   * @param updates - Partial updates for workspace, enabled state, or trigger conditions.
   * @returns The updated route rule.
   */
  @Remote('updateRouteRule')
  async updateRouteRule(
    id: ImRouteRuleId,
    updates: UpdateImRouteRuleOptions,
  ): Promise<ImRouteRule> {
    const { rulesTable } = this.requireDomain()
    const existing = rulesTable.get(id)
    if (!existing) {
      throw routeNotFound(id, `Route rule not found: ${id}`)
    }

    if (existing.conversationKind === 'group' && updates.groupTrigger !== undefined) {
      if (!hasValidGroupTrigger(updates.groupTrigger)) {
        throw invalidTrigger('empty', 'Group trigger must have at least one valid condition with positive numbers')
      }
    }

    return rulesTable.update(id, current => ({
      ...current,
      ...(updates.workspaceId !== undefined ? { workspaceId: updates.workspaceId } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.groupTrigger !== undefined ? { groupTrigger: updates.groupTrigger } : {}),
      updatedAt: new Date().toISOString(),
    }))
  }

  /**
   * Delete an existing route rule.
   * @param id - Route rule identifier.
   * @returns True if deleted, false if the rule did not exist.
   */
  @Remote('deleteRouteRule')
  async deleteRouteRule(id: ImRouteRuleId): Promise<boolean> {
    const { rulesTable } = this.requireDomain()
    const existing = rulesTable.get(id)
    if (!existing) return false

    await rulesTable.delete(id)
    return true
  }

  // --- Target Resolution (Seam) ---

  /**
   * Resolves the route rule for an incoming conversation.
   *
   * Resolution precedence:
   * 1. Check account pause: if paused, returns 'account_paused' (suspending automatic handling).
   * 2. Specific conversation rule match:
   *    - If enabled: returns 'matched'
   *    - If disabled: returns 'disabled' (retains workspace binding, DOES NOT fallback to 'all')
   * 3. 'All' conversation rule match:
   *    - Dynamically covers future unmapped conversations for this account and kind.
   *    - Returns 'matched' if enabled, 'disabled' if disabled.
   * 4. Unmatched: returns 'unconfigured' (prevents routing to sensitive workspaces).
   * @param request - Incoming conversation resolution request.
   * @returns Resolution outcome including matched status, ruleId, workspaceId, or disabled/paused indicators.
   */
  async resolveRoute(request: ImResolveRouteRequest): Promise<ImResolveRouteResult> {
    const { accountsTable } = this.requireDomain()
    const account = accountsTable.get(request.accountId)
    if (!account) {
      return { status: 'unconfigured' }
    }

    const rules = await this.listRouteRules()
    const accountRules = rules.filter(
      r => r.accountId === request.accountId && r.conversationKind === request.conversationKind,
    )
    if (accountRules.length === 0) {
      return { status: 'unconfigured' }
    }

    // 1. Look for specific rule first
    const specificRule = accountRules.find(
      r => r.target.kind === 'specific' && r.target.conversationId === request.conversationId,
    )

    if (specificRule) {
      if (account.paused) {
        return {
          status: 'account_paused',
          accountId: account.id,
          ruleId: specificRule.id,
          workspaceId: specificRule.workspaceId,
        }
      }
      if (!specificRule.enabled) {
        return {
          status: 'disabled',
          ruleId: specificRule.id,
          workspaceId: specificRule.workspaceId,
          ...(specificRule.groupTrigger ? { groupTrigger: specificRule.groupTrigger } : {}),
        }
      }
      return {
        status: 'matched',
        ruleId: specificRule.id,
        workspaceId: specificRule.workspaceId,
        enabled: specificRule.enabled,
        ...(specificRule.groupTrigger ? { groupTrigger: specificRule.groupTrigger } : {}),
      }
    }

    // 2. Look for 'all' rule
    const allRule = accountRules.find(r => r.target.kind === 'all')
    if (allRule) {
      if (account.paused) {
        return {
          status: 'account_paused',
          accountId: account.id,
          ruleId: allRule.id,
          workspaceId: allRule.workspaceId,
        }
      }
      if (!allRule.enabled) {
        return {
          status: 'disabled',
          ruleId: allRule.id,
          workspaceId: allRule.workspaceId,
          ...(allRule.groupTrigger ? { groupTrigger: allRule.groupTrigger } : {}),
        }
      }
      return {
        status: 'matched',
        ruleId: allRule.id,
        workspaceId: allRule.workspaceId,
        enabled: allRule.enabled,
        ...(allRule.groupTrigger ? { groupTrigger: allRule.groupTrigger } : {}),
      }
    }

    // 3. Specific rules exist but none matched this specific conversationId
    return { status: 'unconfigured' }
  }

  // --- Simulation Target Configuration ---

  /**
   * Get the simulation configuration for a workspace.
   * @param workspaceId - Workspace identifier.
   * @returns The simulation configuration if set, or undefined.
   */
  @Remote('getSimulationConfig')
  async getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined> {
    const { simulationsTable } = this.requireDomain()
    return simulationsTable.get(workspaceId)
  }

  /**
   * List every workspace simulation target binding.
   * @returns Saved simulation configurations.
   */
  @Remote('listSimulationConfigs')
  async listSimulationConfigs(): Promise<ImWorkspaceSimulationConfig[]> {
    const { simulationsTable } = this.requireDomain()
    return [...simulationsTable.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, config]) => config)
  }

  /**
   * Configure the IM simulation target for a workspace.
   * Target account must exist, and a configured route rule must cover the target conversation.
   *
   * Note: The route rule may belong to any workspace (e.g. testing an agent in another workspace).
   * Disabled or account-paused route rules still permit simulation testing.
   * @param options - Target account and conversation options.
   * @returns The saved simulation configuration.
   */
  @Remote('setSimulationConfig')
  async setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig> {
    const { accountsTable, rulesTable, simulationsTable } = this.requireDomain()
    const account = accountsTable.get(options.targetAccountId)
    if (!account) {
      throw accountNotFound(
        options.targetAccountId,
        `Cannot configure simulation target: account ${options.targetAccountId} does not exist`,
      )
    }
    const allRules = [...rulesTable.entries()].map(([, rule]) => rule)
    const matchingRules = allRules.filter(
      r => r.accountId === options.targetAccountId && r.conversationKind === options.conversationKind,
    )

    const matchesSpecific = options.targetConversationId
      ? matchingRules.some(r => r.target.kind === 'specific' && r.target.conversationId === options.targetConversationId)
      : false
    const matchesAll = matchingRules.some(r => r.target.kind === 'all')

    if (!matchesSpecific && !matchesAll) {
      throw simulationUnconfigured(
        'no-matching-route',
        `Cannot configure simulation target: no matching route rule found for account ${options.targetAccountId}, kind ${options.conversationKind}${options.targetConversationId ? ` and conversation ${options.targetConversationId}` : ''}`,
      )
    }

    const config: ImWorkspaceSimulationConfig = {
      workspaceId: options.workspaceId,
      targetAccountId: options.targetAccountId,
      conversationKind: options.conversationKind,
      ...(options.targetConversationId !== undefined ? { targetConversationId: options.targetConversationId } : {}),
      updatedAt: new Date().toISOString(),
    }

    await simulationsTable.put(options.workspaceId, config)
    return config
  }

  /**
   * Delete the simulation configuration for a workspace.
   * @param workspaceId - Workspace identifier.
   * @returns True if deleted, false if none existed.
   */
  @Remote('deleteSimulationConfig')
  async deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean> {
    const { simulationsTable } = this.requireDomain()
    const existing = simulationsTable.get(workspaceId)
    if (!existing) return false

    await simulationsTable.delete(workspaceId)
    return true
  }
}
