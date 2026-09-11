/**
 * In-memory IM GUI controller: mutates the snapshot store used by all three
 * surfaces. Wangwang secrets mint a credential reference and are discarded.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ImGuiFace } from './faces.ts'
import {
  routeFromDraft, type ImGuiSnapshot, type ImPlatformId, type WangwangCreds,
} from './model.ts'

/**
 * Bind store mutations as the slot inject face.
 * @param store - GUI snapshot store.
 * @returns the in-memory GUI face used by tests and prototype fixtures.
 */
export function createImGuiFace(store: SnapshotStore<ImGuiSnapshot>): ImGuiFace {
  return {
    hooks: { gui: store },
    connect: (platform, displayName, creds) => {
      store.update((draft) => {
        draft.accounts.push(connectAccount(platform, displayName, creds))
      })
    },
    setPaused: (accountId, paused) => {
      store.update((draft) => {
        const account = draft.accounts.find(row => row.id === accountId)
        if (account !== undefined) account.paused = paused
      })
    },
    disconnect: (accountId) => {
      store.update((draft) => {
        const account = draft.accounts.find(row => row.id === accountId)
        if (account !== undefined) account.connected = false
      })
    },
    saveRoute: (workspaceId, routeDraft, existing) => {
      store.update((draft) => {
        const next = routeFromDraft(routeDraft, workspaceId, existing)
        const index = draft.routes.findIndex(row => row.id === next.id)
        if (index >= 0) draft.routes[index] = next
        else draft.routes.push(next)
      })
    },
    setRouteEnabled: (routeId, enabled) => {
      store.update((draft) => {
        const route = draft.routes.find(row => row.id === routeId)
        if (route !== undefined) route.enabled = enabled
      })
    },
    setSimulationTarget: (workspaceId, targetKey) => {
      store.update((draft) => {
        draft.simulationByWorkspace[workspaceId] = targetKey
      })
    },
    manualSend: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      store.update((draft) => {
        draft.conversation.messages.push({
          id: `manual-${Date.now()}`,
          text: trimmed,
          sender: 'human_dsh',
          delivery: 'sent',
          who: draft.conversation.accountName || 'self',
        })
      })
    },
    setPanel: (panel) => {
      store.update((draft) => { draft.conversation.panel = panel })
    },
    setRole: (role) => {
      store.update((draft) => { draft.conversation.role = role })
    },
    createSimulation: () => {},
    injectMember: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      store.update((draft) => {
        draft.conversation.messages.push({
          id: `member-${Date.now()}`,
          text: trimmed,
          sender: 'external',
          delivery: 'received',
          who: '成员',
        })
      })
    },
    injectManagedHuman: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      store.update((draft) => {
        draft.conversation.messages.push({
          id: `human-${Date.now()}`,
          text: trimmed,
          sender: 'human_dsh',
          delivery: 'received',
          who: draft.conversation.accountName || 'self',
        })
      })
    },
    stopSimulation: () => {
      store.update((draft) => {
        delete draft.conversation.simulationInstanceId
      })
    },
  }
}

function connectAccount(
  platform: ImPlatformId,
  displayName: string,
  creds: WangwangCreds | undefined,
): ImGuiSnapshot['accounts'][number] {
  const credentialRef = platform === 'wangwang'
    ? `cred:${creds?.accessKey ?? 'ww'}`
    : `cred:${platform}-dws`
  return {
    id: `acc-${Date.now()}`,
    platform,
    displayName,
    connected: true,
    paused: false,
    authState: 'ok',
    credentialRef,
  }
}
