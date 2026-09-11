/**
 * Map Host IM config and delivery records onto the GUI snapshot.
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  CreateImAccountOptions,
  CreateImRouteRuleOptions,
  ImAccountId,
  ImAccountMetadata,
  ImDeliveryScope,
  ImRealDeliveryScope,
  ImGroupTriggerConfig,
  ImRouteRule,
  ImRouteRuleId,
  ImGuiInboundView,
  ImGuiOutboundView,
  ImSimulationInstance,
  ImWorkspaceSimulationConfig,
  SetWorkspaceSimulationTargetOptions,
} from '@deepseek-ai/dsh-im-core/client'
import { conversationMessagesFromRecords, type ImDomainConversationRecord } from './presentation.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  parseTargets,
  simulationTargets,
  type ImAccountView,
  type ImConversationView,
  type ImGuiSnapshot,
  type ImPanelMode,
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
 * Pick the conversation scope the Sidebar presents from Host config.
 * Simulation bindings win; otherwise the first takeover rule.
 * All-scope rules use a stable `gui-all` conversation id.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @returns a real delivery scope, or undefined when nothing is configured.
 */
export function selectedConversationScope(
  accounts: readonly ImAccountMetadata[],
  routes: readonly ImRouteRule[],
  simulations: readonly ImWorkspaceSimulationConfig[],
): ImRealDeliveryScope | undefined {
  const simulation = simulations[0]
  if (simulation !== undefined) {
    const account = accounts.find(row => row.id === simulation.targetAccountId)
    return {
      kind: 'real',
      platform: account?.platform ?? 'dingtalk',
      accountId: simulation.targetAccountId,
      conversationId: simulation.targetConversationId ?? 'gui-all',
      conversationKind: simulation.conversationKind,
    }
  }
  const route = routes[0]
  if (route === undefined) return undefined
  const account = accounts.find(row => row.id === route.accountId)
  return {
    kind: 'real',
    platform: account?.platform ?? 'dingtalk',
    accountId: route.accountId,
    conversationId: route.target.kind === 'specific' ? route.target.conversationId : 'gui-all',
    conversationKind: route.conversationKind,
  }
}

/**
 * Pick the delivery scope the Sidebar stream reads.
 * Simulated-user and tested-agent roles use a running instance; otherwise the real GUI scope.
 * @param accounts - durable IM accounts.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @param instances - Host simulation instances.
 * @param role - conversation-tab role.
 * @returns a real or simulation delivery scope, or undefined.
 */
export function selectedStreamScope(
  accounts: readonly ImAccountMetadata[],
  routes: readonly ImRouteRule[],
  simulations: readonly ImWorkspaceSimulationConfig[],
  instances: readonly ImSimulationInstance[],
  role: ImConversationView['role'],
): ImDeliveryScope | undefined {
  const instance = runningInstanceForRole(simulations, instances, routes, accounts, role)
  if (instance !== undefined) {
    return {
      kind: 'sim',
      instanceId: instance.instanceId,
      conversationId: instance.target.conversationId,
      conversationKind: instance.target.conversationKind,
    }
  }
  return selectedConversationScope(accounts, routes, simulations)
}

/**
 * Running instance owned by the simulated-user workspace or bound to the tested workspace.
 * @param simulations - workspace simulation bindings.
 * @param instances - Host simulation instances.
 * @param routes - durable takeover rules.
 * @param accounts - durable IM accounts.
 * @param role - conversation-tab role.
 * @returns the matching running instance, or undefined.
 */
function runningInstanceForRole(
  simulations: readonly ImWorkspaceSimulationConfig[],
  instances: readonly ImSimulationInstance[],
  routes: readonly ImRouteRule[],
  accounts: readonly ImAccountMetadata[],
  role: ImConversationView['role'],
): ImSimulationInstance | undefined {
  if (role === 'simuser') {
    const workspaceId = simulations[0]?.workspaceId
    return instances.find(row => row.workspaceId === workspaceId && row.status === 'running')
  }
  if (role === 'tested') {
    const real = selectedConversationScope(accounts, routes, simulations)
    const testedWorkspaceId = real === undefined ? undefined : matchingRouteForScope(routes, real)?.workspaceId
    return instances.find(row => row.testedWorkspaceId === testedWorkspaceId && row.status === 'running')
  }
  return undefined
}

/**
 * Find the takeover rule that covers a real GUI conversation scope.
 * @param routes - durable takeover rules.
 * @param scope - selected real conversation.
 * @returns the matching rule, or undefined.
 */
export function matchingRouteForScope(
  routes: readonly ImRouteRule[],
  scope: ImDeliveryScope,
): ImRouteRule | undefined {
  if (scope.kind !== 'real') return undefined
  return routes.find((row) => {
    if (row.accountId !== scope.accountId) return false
    if (row.conversationKind !== (scope.conversationKind ?? 'direct')) return false
    if (row.target.kind === 'all') return scope.conversationId === 'gui-all'
    return row.target.conversationId === scope.conversationId
  })
}

/**
 * Workspace that owns the simulated-user or tested-agent Session.
 * Simulation config is the simulated-user workspace; the matching takeover
 * rule is the tested workspace. Other roles do not open a Session.
 * @param role - conversation-tab role the user asked to open.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @param scope - selected real conversation.
 * @returns a workspace id, or undefined when that role has no Host binding.
 */
export function workspaceIdForRole(
  role: ImConversationView['role'],
  routes: readonly ImRouteRule[],
  simulations: readonly ImWorkspaceSimulationConfig[],
  scope: ImDeliveryScope | undefined,
): WorkspaceId | undefined {
  if (role === 'simuser') return simulations[0]?.workspaceId
  if (role === 'tested' && scope !== undefined) return matchingRouteForScope(routes, scope)?.workspaceId
  return undefined
}

/**
 * Map inbound and outbound Host records onto one Sidebar stream.
 * Outbound `result_unknown` stays distinct from `sent`.
 * @param inbound - history for the selected scope.
 * @param outbound - queued and settled outbound for the same scope.
 * @returns domain rows oldest first.
 */
export function conversationRecordsFromDelivery(
  inbound: readonly ImGuiInboundView[],
  outbound: readonly ImGuiOutboundView[],
): ImDomainConversationRecord[] {
  const rows: Array<ImDomainConversationRecord & { readonly at: string }> = [
    ...inbound.map(record => ({
      id: record.messageId,
      text: record.text,
      who: record.senderNick ?? record.senderId ?? record.senderClassification,
      sender: record.senderClassification,
      inboundStage: record.stage,
      at: record.receivedAt,
    })),
    ...outbound.map(record => ({
      id: record.requestId,
      text: record.text,
      who: record.intent === 'human_manual' ? 'self' : '数字员工',
      sender: record.intent === 'human_manual' ? 'human_dsh' as const : 'ai_outbound' as const,
      outboundStatus: record.status,
      at: record.createdAt,
    })),
  ]
  rows.sort((left, right) => left.at.localeCompare(right.at))
  return rows.map(({ at: _at, ...record }) => record)
}

/**
 * Present the selected Host conversation without claiming live outbound.
 * @param accounts - durable IM accounts.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @param inbound - history for the selected scope.
 * @param outbound - outbound records for the selected scope.
 * @param previous - prior conversation chrome such as role.
 * @param instances - Host simulation instances used when role is simuser or tested.
 * @returns Sidebar conversation view.
 */
export function conversationFromHost(
  accounts: readonly ImAccountMetadata[],
  routes: readonly ImRouteRule[],
  simulations: readonly ImWorkspaceSimulationConfig[],
  inbound: readonly ImGuiInboundView[],
  outbound: readonly ImGuiOutboundView[],
  previous: ImConversationView,
  instances: readonly ImSimulationInstance[] = [],
): ImConversationView {
  const realScope = selectedConversationScope(accounts, routes, simulations)
  const scope = selectedStreamScope(accounts, routes, simulations, instances, previous.role)
  if (realScope === undefined && scope === undefined) {
    return {
      ...emptyConversation(),
      role: previous.role,
      unconfigured: true,
    }
  }
  const chromeScope = realScope
  const account = chromeScope === undefined
    ? undefined
    : accounts.find(row => row.id === chromeScope.accountId)
  const route = chromeScope === undefined ? undefined : matchingRouteForScope(routes, chromeScope)
  const panel: ImPanelMode = account?.status !== 'connected'
    ? 'offline'
    : route === undefined
      ? 'unknown'
      : route.enabled ? 'live' : 'disabled'
  const streamId = scope?.conversationId ?? chromeScope?.conversationId ?? ''
  const kind = scope?.conversationKind ?? chromeScope?.conversationKind
  const kindLabel = kind === 'direct' ? '私聊' : '群聊'
  const prefix = scope?.kind === 'sim' ? '模拟' : kindLabel
  return {
    title: `${prefix}：${streamId}`,
    accountName: account?.displayName ?? '',
    panel,
    role: previous.role,
    unconfigured: false,
    messages: conversationMessagesFromRecords(conversationRecordsFromDelivery(inbound, outbound)),
    ...(previous.simUserSessionId === undefined ? {} : { simUserSessionId: previous.simUserSessionId }),
    ...(previous.testedSessionId === undefined ? {} : { testedSessionId: previous.testedSessionId }),
    ...(scope?.kind === 'sim' ? { simulationInstanceId: scope.instanceId } : {}),
  }
}

/**
 * Rebuild account, route, simulation, and conversation rows from Host records.
 * @param accounts - durable IM accounts.
 * @param routes - durable takeover rules.
 * @param simulations - workspace simulation bindings.
 * @param conversation - previous conversation chrome plus Host stream rows.
 * @returns GUI snapshot with Host-backed config and conversation.
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
