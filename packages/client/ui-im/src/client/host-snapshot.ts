/**
 * Map Host IM config records onto the GUI snapshot. Conversation stream
 * presentation stays local until imDelivery remotes exist.
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  CreateImAccountOptions,
  CreateImRouteRuleOptions,
  ImAccountId,
  ImAccountMetadata,
  ImGroupTriggerConfig,
  ImRouteRule,
  ImRouteRuleId,
  ImWorkspaceSimulationConfig,
  SetWorkspaceSimulationTargetOptions,
} from '@deepseek-ai/dsh-im-core/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  parseTargets,
  simulationTargets,
  type ImAccountView,
  type ImConversationView,
  type ImGuiSnapshot,
  type ImPlatformId,
  type ImRouteDraft,
  type ImRouteView,
  type ImSimulationTargetView,
  type WangwangCreds,
} from './model.ts'

/**
 * Present one Host account without secrets.
 * @param account - durable IM account metadata.
 * @returns the Settings row for that account.
 */
export function accountViewFromMetadata(account: ImAccountMetadata): ImAccountView {
  return {
    id: account.id,
    platform: account.platform,
    displayName: account.displayName,
    connected: account.status === 'connected',
    paused: account.paused,
    authState: account.status === 'error' ? 'expired' : 'ok',
    ...(account.credentialRef === undefined ? {} : { credentialRef: account.credentialRef }),
  }
}

/**
 * Present one Host route rule. Interval seconds become GUI minutes.
 * @param rule - durable takeover rule.
 * @returns the workspace-card row for that rule.
 */
export function routeViewFromRule(rule: ImRouteRule): ImRouteView {
  const groupTrigger = rule.groupTrigger === undefined
    ? undefined
    : {
      mention: rule.groupTrigger.mention === true,
      everyN: rule.groupTrigger.everyN ?? null,
      intervalMin: rule.groupTrigger.fixedIntervalSeconds === undefined
        ? null
        : Math.max(1, Math.round(rule.groupTrigger.fixedIntervalSeconds / 60)),
    }
  return {
    id: rule.id,
    workspaceId: rule.workspaceId,
    accountId: rule.accountId,
    conversationKind: rule.conversationKind,
    scope: rule.target.kind,
    targets: rule.target.kind === 'specific' ? [rule.target.conversationId] : [],
    enabled: rule.enabled,
    ...(groupTrigger === undefined ? {} : { groupTrigger }),
  }
}

/**
 * Encode a Host simulation binding as the GUI select key.
 * @param config - workspace simulation target.
 * @param routes - GUI route rows used to mint select keys.
 * @returns the matching select key, or undefined when no configured route covers the target.
 */
export function simulationKeyFromConfig(
  config: ImWorkspaceSimulationConfig,
  routes: readonly ImRouteView[],
): string | undefined {
  const match = simulationTargets({
    accounts: [{
      id: config.targetAccountId,
      platform: 'dingtalk',
      displayName: config.targetAccountId,
      connected: true,
      paused: false,
      authState: 'ok',
    }],
    routes: [...routes],
    simulationByWorkspace: {},
    conversation: emptyConversation(),
  }).find((target) => {
    if (target.accountId !== config.targetAccountId) return false
    if (target.conversationKind !== config.conversationKind) return false
    if (config.targetConversationId === undefined) return target.conversationId === undefined
    return target.conversationId === config.targetConversationId
  })
  return match?.key
}

/**
 * Decode a GUI select key into a Host simulation target.
 * @param workspaceId - simulated-user workspace.
 * @param targetKey - GUI select value.
 * @param targets - configured takeover routes presented as simulation choices.
 * @returns Host setSimulationConfig options, or undefined when the key is unknown.
 */
export function simulationOptionsFromKey(
  workspaceId: string,
  targetKey: string,
  targets: readonly ImSimulationTargetView[],
): SetWorkspaceSimulationTargetOptions | undefined {
  const target = targets.find(row => row.key === targetKey)
  if (target === undefined) return undefined
  return {
    workspaceId: brandString<WorkspaceId>(workspaceId),
    targetAccountId: brandString<ImAccountId>(target.accountId),
    conversationKind: target.conversationKind,
    ...(target.conversationId === undefined ? {} : { targetConversationId: target.conversationId }),
  }
}

/**
 * Group-trigger payload for Host create/update. Minutes become seconds.
 * @param draft - GUI route form.
 * @returns Host group-trigger config, or undefined for direct conversations.
 */
export function groupTriggerFromDraft(draft: ImRouteDraft): ImGroupTriggerConfig | undefined {
  if (draft.conversationKind !== 'group') return undefined
  return {
    ...(draft.mention ? { mention: true } : {}),
    ...(draft.everyNEnabled ? { everyN: Number(draft.everyN) } : {}),
    ...(draft.intervalEnabled ? { fixedIntervalSeconds: Number(draft.intervalMin) * 60 } : {}),
  }
}

/**
 * Host create payload for a GUI route. New rules stay disabled; edits keep
 * the existing id and enabled flag while replacing target and trigger.
 * @param workspaceId - takeover workspace that owns the rule.
 * @param draft - GUI route form.
 * @param existing - existing row when editing.
 * @returns Host createRouteRule options.
 */
export function createRouteOptionsFromDraft(
  workspaceId: string,
  draft: ImRouteDraft,
  existing?: ImRouteView,
): CreateImRouteRuleOptions {
  const targets = draft.scope === 'specific' ? parseTargets(draft.targetsText) : []
  const groupTrigger = groupTriggerFromDraft(draft)
  return {
    id: brandString<ImRouteRuleId>(existing?.id ?? `route-${Date.now()}`),
    accountId: brandString<ImAccountId>(draft.accountId),
    conversationKind: draft.conversationKind,
    target: draft.scope === 'specific' && targets[0] !== undefined
      ? { kind: 'specific', conversationId: targets[0] }
      : { kind: 'all' },
    workspaceId: brandString<WorkspaceId>(workspaceId),
    enabled: existing?.enabled ?? false,
    ...(groupTrigger === undefined ? {} : { groupTrigger }),
  }
}

/**
 * Host account create payload. Wangwang secrets never leave the form.
 * @param platform - DingTalk or Wangwang.
 * @param displayName - account alias shown in Settings.
 * @param creds - Wangwang form values used only to mint a credential reference.
 * @returns Host upsertAccount options with no secrets.
 */
export function createAccountOptions(
  platform: ImPlatformId,
  displayName: string,
  creds: WangwangCreds | undefined,
): CreateImAccountOptions {
  void creds
  const credentialRef = platform === 'wangwang'
    ? 'WANGWANG_ACCESS_KEY'
    : 'DINGTALK_DWS_TOKEN'
  return {
    id: brandString<ImAccountId>(`acc-${Date.now()}`),
    platform,
    displayName,
    credentialRef: brandString<NonNullable<ImAccountMetadata['credentialRef']>>(credentialRef),
    status: 'connected',
    paused: false,
  }
}

/**
 * Rebuild account, route, and simulation rows from Host records.
 * Conversation stream stays as the previous local presentation.
 * @param accounts - durable IM accounts.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @param conversation - previous local conversation presentation.
 * @returns GUI snapshot with Host-backed config rows.
 */
export function snapshotFromHost(
  accounts: readonly ImAccountMetadata[],
  routes: readonly ImRouteRule[],
  simulations: readonly ImWorkspaceSimulationConfig[],
  conversation: ImConversationView,
): ImGuiSnapshot {
  const routeViews = routes.map(routeViewFromRule)
  const simulationByWorkspace: Record<string, string | undefined> = {}
  for (const config of simulations) {
    simulationByWorkspace[config.workspaceId] = simulationKeyFromConfig(config, routeViews)
  }
  return {
    accounts: accounts.map(accountViewFromMetadata),
    routes: routeViews,
    simulationByWorkspace,
    conversation,
  }
}

function emptyConversation(): ImConversationView {
  return {
    title: '',
    accountName: '',
    panel: 'live',
    role: 'real',
    unconfigured: false,
    messages: [],
  }
}
