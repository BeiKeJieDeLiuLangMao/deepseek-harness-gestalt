/**
 * Client-visible IM GUI snapshot: accounts, routes, simulation targets, and
 * the Sidebar conversation stream. Secrets never enter this snapshot.
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Supported platforms for this GUI. Feishu is out of scope. */
export type ImPlatformId = 'dingtalk' | 'wangwang'

/** Authorization freshness, independent of connection. */
export type ImAccountAuthState = 'ok' | 'expired'

/** Account row shown in Settings → IM Accounts. */
export interface ImAccountView {
  id: string
  platform: ImPlatformId
  displayName: string
  connected: boolean
  paused: boolean
  authState: ImAccountAuthState
  /** Opaque credential reference; never a secret. */
  credentialRef?: string
}

/** Conversation kind matching the IM domain. */
export type ImConversationKindView = 'direct' | 'group'

/** All-or-specific route target. */
export type ImRouteScopeView = 'all' | 'specific'

/** Group trigger OR of mention / every-N / fixed interval. */
export interface ImGroupTriggerView {
  readonly mention: boolean
  readonly everyN: number | null
  readonly intervalMin: number | null
}

/** One workspace takeover rule. Disabled rules keep their binding. */
export interface ImRouteView {
  id: string
  workspaceId: string
  accountId: string
  conversationKind: ImConversationKindView
  scope: ImRouteScopeView
  targets: readonly string[]
  enabled: boolean
  groupTrigger?: ImGroupTriggerView
}

/** Draft used by the route editor. */
export interface ImRouteDraft {
  readonly accountId: string
  readonly conversationKind: ImConversationKindView
  readonly scope: ImRouteScopeView
  readonly targetsText: string
  readonly mention: boolean
  readonly everyNEnabled: boolean
  readonly everyN: string
  readonly intervalEnabled: boolean
  readonly intervalMin: string
}

/** One selectable simulation target derived from a configured route. */
export interface ImSimulationTargetView {
  readonly key: string
  readonly accountId: string
  readonly conversationKind: ImConversationKindView
  readonly conversationId?: string
  readonly label: string
}

/** Sender classification badges shown in the IM conversation tab. */
export type ImSenderBadge = 'external' | 'ai_outbound' | 'human_native' | 'human_dsh' | 'unknown'

/**
 * Delivery presentation. `result_unknown` is not success — it must stay
 * distinct from `sent`.
 */
export type ImDeliveryState =
  | 'received'
  | 'submitted'
  | 'sent'
  | 'pending'
  | 'result_unknown'
  | 'confirmed_failed'

/** One row in the Sidebar IM stream. */
export interface ImConversationMessageView {
  readonly id: string
  readonly text: string
  readonly sender: ImSenderBadge
  readonly delivery: ImDeliveryState
  readonly who: string
}

/** Takeover strip state in the conversation tab. */
export type ImPanelMode = 'live' | 'disabled' | 'offline' | 'unknown'

/** Conversation tab body. */
export interface ImConversationView {
  title: string
  accountName: string
  panel: ImPanelMode
  role: 'simuser' | 'tested' | 'real'
  simUserSessionId?: string
  testedSessionId?: string
  unconfigured: boolean
  messages: ImConversationMessageView[]
}

/** Whole GUI snapshot shared by the three surfaces. */
export interface ImGuiSnapshot {
  accounts: ImAccountView[]
  routes: ImRouteView[]
  simulationByWorkspace: Record<string, string | undefined>
  conversation: ImConversationView
}

/** Wangwang credential fields collected only to mint a credential reference. */
export interface WangwangCreds {
  readonly endpoint: string
  readonly accessKey: string
  readonly secretKey: string
}

/** Empty route editor draft. */
export function emptyRouteDraft(accountId: string): ImRouteDraft {
  return {
    accountId,
    conversationKind: 'group',
    scope: 'all',
    targetsText: '',
    mention: true,
    everyNEnabled: false,
    everyN: '10',
    intervalEnabled: false,
    intervalMin: '5',
  }
}

/** Draft populated from an existing rule. */
export function draftFromRoute(route: ImRouteView): ImRouteDraft {
  const trigger = route.groupTrigger
  return {
    accountId: route.accountId,
    conversationKind: route.conversationKind,
    scope: route.scope,
    targetsText: route.targets.join(', '),
    mention: trigger?.mention === true,
    everyNEnabled: trigger?.everyN != null,
    everyN: String(trigger?.everyN ?? 10),
    intervalEnabled: trigger?.intervalMin != null,
    intervalMin: String(trigger?.intervalMin ?? 5),
  }
}

/**
 * Validate Wangwang credential fields before minting a credential reference.
 * @param creds - form values; the secret is discarded after this check.
 * @returns a localized error key, or undefined when the form is valid.
 */
export function wangwangCredError(creds: WangwangCreds):
  | 'endpointRequired' | 'endpointInvalid' | 'accessKeyRequired' | 'accessKeyInvalid'
  | 'secretRequired' | 'secretShort' | undefined {
  if (creds.endpoint.trim() === '') return 'endpointRequired'
  if (!/^https?:\/\/.+/u.test(creds.endpoint.trim())) return 'endpointInvalid'
  if (creds.accessKey.trim() === '') return 'accessKeyRequired'
  if (!/^[A-Za-z0-9-]{4,}$/u.test(creds.accessKey.trim())) return 'accessKeyInvalid'
  if (creds.secretKey === '') return 'secretRequired'
  if (creds.secretKey.length < 4) return 'secretShort'
  return undefined
}

/**
 * Validate a group trigger OR. Direct chats skip this.
 * @param draft - editor values.
 * @returns a localized error key, or undefined when valid.
 */
export function groupTriggerError(draft: ImRouteDraft):
  | 'triggerRequired' | 'everyNInvalid' | 'intervalInvalid' | undefined {
  if (draft.conversationKind !== 'group') return undefined
  const everyN = draft.everyNEnabled ? Number(draft.everyN) : null
  const intervalMin = draft.intervalEnabled ? Number(draft.intervalMin) : null
  if (!draft.mention && everyN === null && intervalMin === null) return 'triggerRequired'
  if (draft.everyNEnabled && (!Number.isInteger(everyN) || everyN === null || everyN < 1)) {
    return 'everyNInvalid'
  }
  if (draft.intervalEnabled && (!Number.isInteger(intervalMin) || intervalMin === null || intervalMin < 1)) {
    return 'intervalInvalid'
  }
  return undefined
}

/**
 * Validate a route draft before save. New rules start disabled.
 * @param draft - editor values.
 * @returns a localized error key, or undefined when valid.
 */
export function routeDraftError(draft: ImRouteDraft):
  | 'targetsRequired' | 'triggerRequired' | 'everyNInvalid' | 'intervalInvalid' | undefined {
  if (draft.scope === 'specific' && parseTargets(draft.targetsText).length === 0) return 'targetsRequired'
  return groupTriggerError(draft)
}

/** Split a comma-separated conversation list. */
export function parseTargets(text: string): readonly string[] {
  return text.split(/[,，]/u).map(part => part.trim()).filter(part => part !== '')
}

/**
 * Build the durable route from a valid draft. New rules are disabled.
 * @param draft - validated editor values.
 * @param workspaceId - owning workspace.
 * @param existing - rule being edited, if any.
 */
export function routeFromDraft(
  draft: ImRouteDraft,
  workspaceId: string,
  existing: ImRouteView | undefined,
): ImRouteView {
  const targets = draft.scope === 'specific' ? parseTargets(draft.targetsText) : []
  const groupTrigger = draft.conversationKind === 'group'
    ? {
      mention: draft.mention,
      everyN: draft.everyNEnabled ? Number(draft.everyN) : null,
      intervalMin: draft.intervalEnabled ? Number(draft.intervalMin) : null,
    }
    : undefined
  return {
    id: existing?.id ?? `route-${Date.now()}`,
    workspaceId,
    accountId: draft.accountId,
    conversationKind: draft.conversationKind,
    scope: draft.scope,
    targets,
    enabled: existing?.enabled ?? false,
    ...(groupTrigger === undefined ? {} : { groupTrigger }),
  }
}

/**
 * Simulation tools exist only after the workspace has a configured target.
 * @param snapshot - GUI snapshot.
 * @param workspaceId - simulated-user workspace.
 */
export function simulationConfigured(snapshot: ImGuiSnapshot, workspaceId: string): boolean {
  const key = snapshot.simulationByWorkspace[workspaceId]
  if (key === undefined || key === '') return false
  return simulationTargets(snapshot).some(target => target.key === key)
}

/**
 * Targets a workspace may bind: every configured takeover rule.
 * The simulated-user workspace picks a tested-workspace rule, so the
 * directory is not filtered to the selecting workspace.
 * @param snapshot - GUI snapshot.
 */
export function simulationTargets(snapshot: ImGuiSnapshot): readonly ImSimulationTargetView[] {
  const out: ImSimulationTargetView[] = []
  for (const route of snapshot.routes) {
    const account = snapshot.accounts.find(row => row.id === route.accountId)
    if (account === undefined) continue
    const kind = route.conversationKind === 'group' ? 'group' : 'direct'
    if (route.scope === 'all') {
      out.push({
        key: `all:${route.id}`,
        accountId: account.id,
        conversationKind: kind,
        label: `${account.displayName} · all ${kind}`,
      })
      continue
    }
    for (const conversationId of route.targets) {
      out.push({
        key: `specific:${route.id}:${conversationId}`,
        accountId: account.id,
        conversationKind: kind,
        conversationId,
        label: `${account.displayName} · ${conversationId}`,
      })
    }
  }
  return out
}

/** Whether a disabled specific rule still occupies its conversations. */
export function disabledKeepsBinding(route: ImRouteView): boolean {
  return !route.enabled && route.scope === 'specific'
}

/** Delivery states that must not render as success. */
export function deliveryIsSuccess(state: ImDeliveryState): boolean {
  return state === 'sent'
}

/** Empty GUI snapshot used before the first fixture. */
export function emptyGuiSnapshot(): ImGuiSnapshot {
  return {
    accounts: [],
    routes: [],
    simulationByWorkspace: {},
    conversation: {
      title: '',
      accountName: '',
      panel: 'live',
      role: 'real',
      unconfigured: false,
      messages: [],
    },
  }
}

/** Prototype-aligned seed used by the experience-route test and default plugin store. */
export function prototypeGuiSnapshot(): ImGuiSnapshot {
  return {
    accounts: [
      {
        id: 'acc-dt',
        platform: 'dingtalk',
        displayName: '陈小宇',
        connected: true,
        paused: false,
        authState: 'ok',
        credentialRef: 'cred:dingtalk-dws',
      },
      {
        id: 'acc-ww',
        platform: 'wangwang',
        displayName: '潮流女装旗舰店',
        connected: true,
        paused: false,
        authState: 'ok',
        credentialRef: 'cred:ww-ak-ref',
      },
    ],
    routes: [
      {
        id: 'route-group',
        workspaceId: 'ws-tested',
        accountId: 'acc-dt',
        conversationKind: 'group',
        scope: 'specific',
        targets: ['度假开发联调群'],
        enabled: true,
        groupTrigger: { mention: true, everyN: null, intervalMin: null },
      },
      {
        id: 'route-dm',
        workspaceId: 'ws-tested',
        accountId: 'acc-ww',
        conversationKind: 'direct',
        scope: 'all',
        targets: [],
        enabled: false,
      },
    ],
    simulationByWorkspace: { 'ws-simuser': 'all:route-dm' },
    conversation: {
      title: '群聊：度假开发联调群',
      accountName: '陈小宇',
      panel: 'live',
      role: 'real',
      simUserSessionId: 'sess-simuser',
      testedSessionId: 'sess-tested',
      unconfigured: false,
      messages: [
        {
          id: 'm1',
          text: '周末发布回滚方案谁来跟？',
          sender: 'external',
          delivery: 'submitted',
          who: '张伟',
        },
        {
          id: 'm2',
          text: '我先看支付回调超时。',
          sender: 'ai_outbound',
          delivery: 'sent',
          who: '数字员工',
        },
        {
          id: 'm3',
          text: '我在群里说一声。',
          sender: 'human_native',
          delivery: 'received',
          who: '陈小宇',
        },
        {
          id: 'm4',
          text: '已从 DSH 补了一句。',
          sender: 'human_dsh',
          delivery: 'sent',
          who: '陈小宇',
        },
        {
          id: 'm5',
          text: '这条身份还不清楚。',
          sender: 'unknown',
          delivery: 'result_unknown',
          who: '未知',
        },
      ],
    },
  }
}

/**
 * Create the in-memory GUI store. Tests inject their own snapshot; the plugin
 * default is the prototype seed.
 * @param init - starting snapshot.
 */
export function createImGuiStore(init: ImGuiSnapshot = prototypeGuiSnapshot()): SnapshotStore<ImGuiSnapshot> {
  return createSnapshotStore(init, { flush: 'sync' })
}
