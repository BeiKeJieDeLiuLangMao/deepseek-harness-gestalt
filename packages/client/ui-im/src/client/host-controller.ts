/**
 * Host-backed IM GUI controller: persist accounts, routes, simulation
 * targets, and the conversation stream through imConfig and imDelivery remotes.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ImAccountId,
  ImAccountMetadata,
  ImOutboundRequestId,
  ImRouteRuleId,
} from '@deepseek-ai/dsh-im-core/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImGuiFace } from './faces.ts'
import {
  conversationFromHost,
  createAccountOptions,
  createRouteOptionsFromDraft,
  matchingRouteForScope,
  selectedConversationScope,
  snapshotFromHost,
  simulationOptionsFromKey,
} from './host-snapshot.ts'
import { simulationTargets, type ImGuiSnapshot } from './model.ts'

/** Generated imConfig Remote namespace mounted by api-remotes. */
export type ImConfigRemote = ClientContext['remote']['imConfig']

/** Generated imDelivery Remote namespace mounted by api-remotes. */
export type ImDeliveryRemote = ClientContext['remote']['imDelivery']

/**
 * Bind Host remotes as the slot inject face.
 * @param store - GUI snapshot store.
 * @param remote - generated imConfig Remote namespace.
 * @param delivery - generated imDelivery Remote namespace.
 * @returns the shared GUI face for Settings, workspace cards, and the Sidebar tab.
 */
export function createHostImGuiFace(
  store: SnapshotStore<ImGuiSnapshot>,
  remote: ImConfigRemote,
  delivery: ImDeliveryRemote,
): ImGuiFace {
  const refresh = async (): Promise<void> => {
    const [accounts, routes, simulations] = await Promise.all([
      remote.listAccounts(),
      remote.listRouteRules(),
      remote.listSimulationConfigs(),
    ])
    if (!accounts.ok || !routes.ok || !simulations.ok) return
    const scope = selectedConversationScope(accounts.value, routes.value, simulations.value)
    let inbound: Awaited<ReturnType<ImDeliveryRemote['queryHistory']>> = { ok: true, value: [] }
    let outbound: Awaited<ReturnType<ImDeliveryRemote['listOutbound']>> = { ok: true, value: [] }
    if (scope !== undefined) {
      ;[inbound, outbound] = await Promise.all([
        delivery.queryHistory({ scope }),
        delivery.listOutbound({ scope }),
      ])
    }
    if (!inbound.ok || !outbound.ok) return
    store.update((draft) => {
      const conversation = conversationFromHost(
        accounts.value,
        routes.value,
        simulations.value,
        inbound.value,
        outbound.value,
        draft.conversation,
      )
      const next = snapshotFromHost(accounts.value, routes.value, simulations.value, conversation)
      draft.accounts = next.accounts
      draft.routes = next.routes
      draft.simulationByWorkspace = next.simulationByWorkspace
      draft.conversation = next.conversation
    })
  }
  void refresh()
  return {
    hooks: { gui: store },
    connect: (platform, displayName, creds) => {
      void (async () => {
        const result = await remote.upsertAccount(createAccountOptions(platform, displayName, creds))
        if (result.ok) await refresh()
      })()
    },
    setPaused: (accountId, paused) => {
      void (async () => {
        const result = await remote.pauseAccount(brandString<ImAccountId>(accountId), paused)
        if (result.ok) await refresh()
      })()
    },
    disconnect: (accountId) => {
      void (async () => {
        const account = store.getSnapshot().accounts.find(row => row.id === accountId)
        if (account === undefined) return
        const result = await remote.upsertAccount({
          id: brandString<ImAccountId>(account.id),
          platform: account.platform,
          displayName: account.displayName,
          ...(account.credentialRef === undefined
            ? {}
            : { credentialRef: brandString<NonNullable<ImAccountMetadata['credentialRef']>>(account.credentialRef) }),
          status: 'disconnected',
          paused: account.paused,
        })
        if (result.ok) await refresh()
      })()
    },
    saveRoute: (workspaceId, draft, existing) => {
      void (async () => {
        const result = await remote.createRouteRule(
          createRouteOptionsFromDraft(workspaceId, draft, existing),
        )
        if (result.ok) await refresh()
      })()
    },
    setRouteEnabled: (routeId, enabled) => {
      void (async () => {
        const result = await remote.updateRouteRule(
          brandString<ImRouteRuleId>(routeId),
          { enabled },
        )
        if (result.ok) await refresh()
      })()
    },
    setSimulationTarget: (workspaceId, targetKey) => {
      void (async () => {
        if (targetKey === undefined) {
          const result = await remote.deleteSimulationConfig(brandString<WorkspaceId>(workspaceId))
          if (result.ok) await refresh()
          return
        }
        const options = simulationOptionsFromKey(
          workspaceId,
          targetKey,
          simulationTargets(store.getSnapshot()),
        )
        if (options === undefined) return
        const result = await remote.setSimulationConfig(options)
        if (result.ok) await refresh()
      })()
    },
    manualSend: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      void (async () => {
        const [accounts, routes, simulations] = await Promise.all([
          remote.listAccounts(),
          remote.listRouteRules(),
          remote.listSimulationConfigs(),
        ])
        if (!accounts.ok || !routes.ok || !simulations.ok) return
        const scope = selectedConversationScope(accounts.value, routes.value, simulations.value)
        if (scope === undefined) return
        const result = await delivery.registerManualOutbound({
          requestId: brandString<ImOutboundRequestId>(`manual-${Date.now()}`),
          scope,
          text: trimmed,
        })
        if (result.ok) await refresh()
      })()
    },
    setPanel: (panel) => {
      if (panel !== 'live' && panel !== 'disabled') {
        store.update((draft) => { draft.conversation.panel = panel })
        return
      }
      void (async () => {
        const [accounts, routes, simulations] = await Promise.all([
          remote.listAccounts(),
          remote.listRouteRules(),
          remote.listSimulationConfigs(),
        ])
        if (!accounts.ok || !routes.ok || !simulations.ok) return
        const scope = selectedConversationScope(accounts.value, routes.value, simulations.value)
        if (scope === undefined || scope.kind !== 'real') return
        const route = matchingRouteForScope(routes.value, scope)
        if (route === undefined) return
        const enabled = panel === 'live'
        const updated = await remote.updateRouteRule(route.id, { enabled })
        if (!updated.ok) return
        if (!enabled) {
          await delivery.cancelPendingAiOutbound({
            scope,
            reason: 'conversation_route_disabled',
          })
        }
        await refresh()
      })()
    },
    setRole: (role) => {
      store.update((draft) => { draft.conversation.role = role })
    },
  }
}
