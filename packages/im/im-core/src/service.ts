/**
 * Service implementation and Cordis registration for IM domain configuration.
 *
 * @module @deepseek-ai/dsh-im-core/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { imDomainSpec, type ImDomainState } from './spec.ts'
import type {
  ImAccountId,
  ImAccountMetadata,
  ImAccountStatus,
  ImConversationKind,
  ImGroupTriggerConfig,
  ImResolveRouteRequest,
  ImResolveRouteResult,
  ImRouteRule,
  ImRouteRuleId,
  ImRouteTarget,
  ImWorkspaceSimulationConfig,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imConfig: ImConfigService
  }
}

export interface CreateImAccountOptions {
  id: ImAccountId
  platform: 'dingtalk' | 'wangwang'
  displayName: string
  credentialRef?: ImAccountMetadata['credentialRef']
  status?: ImAccountStatus
  paused?: boolean
  platformMetadata?: Record<string, string>
}

export interface CreateImRouteRuleOptions {
  id: ImRouteRuleId
  accountId: ImAccountId
  conversationKind: ImConversationKind
  target: ImRouteTarget
  workspaceId: WorkspaceId
  enabled?: boolean
  groupTrigger?: ImGroupTriggerConfig
}

export interface SetWorkspaceSimulationTargetOptions {
  workspaceId: WorkspaceId
  targetAccountId: ImAccountId
  conversationKind: ImConversationKind
  targetConversationId?: string
}

function hasValidGroupTrigger(trigger: ImGroupTriggerConfig): boolean {
  if (trigger.mention === true) return true
  if (trigger.everyN !== undefined && trigger.everyN > 0) return true
  if (trigger.fixedIntervalSeconds !== undefined && trigger.fixedIntervalSeconds > 0) return true
  return false
}

/**
 * IM configuration service managing accounts, route rules, and simulation target binding.
 */
export class ImConfigService extends Service {
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
  async pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata> {
    const { accountsTable } = this.requireDomain()
    const account = accountsTable.get(id)
    if (!account) {
      throw new Error(`IM account not found: ${id}`)
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
  async deleteAccount(id: ImAccountId): Promise<boolean> {
    const { accountsTable, rulesTable } = this.requireDomain()
    const existing = accountsTable.get(id)
    if (!existing) return false

    // Cascade remove route rules associated with this account
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
   * Create a new route rule for an account and conversation target.
   * @param options - Route rule definition options.
   * @returns The created route rule.
   */
  async createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule> {
    const { accountsTable, rulesTable } = this.requireDomain()
    // Validate account exists
    const account = accountsTable.get(options.accountId)
    if (!account) {
      throw new Error(`Cannot bind route rule to non-existent account: ${options.accountId}`)
    }

    // Validate group trigger requirements
    if (options.conversationKind === 'group') {
      if (!options.groupTrigger) {
        throw new Error('Group trigger configuration is required for group conversations')
      }
      if (!hasValidGroupTrigger(options.groupTrigger)) {
        throw new Error('Group trigger must have at least one valid condition with positive numbers')
      }
    } else if (options.groupTrigger !== undefined) {
      throw new Error('Group triggers are not allowed for direct conversations')
    }

    // Check same conversation single workspace invariant:
    // A specific conversation can only be bound to one workspace. Rebinding requires explicit update.
    const allRules = await this.listRouteRules()
    if (options.target.kind === 'specific') {
      const targetConvId = options.target.conversationId
      const conflict = allRules.find(
        r =>
          r.accountId === options.accountId &&
          r.conversationKind === options.conversationKind &&
          r.target.kind === 'specific' &&
          r.target.conversationId === targetConvId &&
          r.id !== options.id,
      )
      if (conflict) {
        throw new Error(
          `Conversation ${targetConvId} is already bound to workspace ${conflict.workspaceId}. Explicit rebind required.`,
        )
      }
    }

    const now = new Date().toISOString()
    const rule: ImRouteRule = {
      id: options.id,
      accountId: options.accountId,
      conversationKind: options.conversationKind,
      target: options.target,
      workspaceId: options.workspaceId,
      enabled: options.enabled ?? true,
      ...(options.groupTrigger !== undefined ? { groupTrigger: options.groupTrigger } : {}),
      createdAt: now,
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
  async updateRouteRule(
    id: ImRouteRuleId,
    updates: Partial<Pick<ImRouteRule, 'workspaceId' | 'enabled' | 'groupTrigger'>>,
  ): Promise<ImRouteRule> {
    const { rulesTable } = this.requireDomain()
    const existing = rulesTable.get(id)
    if (!existing) {
      throw new Error(`Route rule not found: ${id}`)
    }

    if (existing.conversationKind === 'group' && updates.groupTrigger !== undefined) {
      if (!hasValidGroupTrigger(updates.groupTrigger)) {
        throw new Error('Group trigger must have at least one valid condition with positive numbers')
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
  async getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined> {
    const { simulationsTable } = this.requireDomain()
    return simulationsTable.get(workspaceId)
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
  async setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig> {
    const { accountsTable, rulesTable, simulationsTable } = this.requireDomain()
    // Invariant: Simulation target must refer to an already configured account
    const account = accountsTable.get(options.targetAccountId)
    if (!account) {
      throw new Error(`Cannot configure simulation target: account ${options.targetAccountId} does not exist`)
    }

    // Invariant: Simulation target must match a configured route rule (specific or all) for the target account and conversationKind.
    // The route rule may belong to another workspace (e.g. testing a bot workspace).
    // Disabled or account-paused rules remain valid simulation targets.
    const allRules = [...rulesTable.entries()].map(([, rule]) => rule)
    const matchingRules = allRules.filter(
      r => r.accountId === options.targetAccountId && r.conversationKind === options.conversationKind,
    )

    const matchesSpecific = options.targetConversationId
      ? matchingRules.some(r => r.target.kind === 'specific' && r.target.conversationId === options.targetConversationId)
      : false
    const matchesAll = matchingRules.some(r => r.target.kind === 'all')

    if (!matchesSpecific && !matchesAll) {
      throw new Error(
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
  async deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean> {
    const { simulationsTable } = this.requireDomain()
    const existing = simulationsTable.get(workspaceId)
    if (!existing) return false

    await simulationsTable.delete(workspaceId)
    return true
  }
}
