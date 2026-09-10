/**
 * Injected GUI face shared by IM Accounts, workspace cards, and the Sidebar tab.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ImGuiSnapshot, ImPlatformId, WangwangCreds } from './model.ts'
import type { ImRouteDraft, ImRouteView } from './model.ts'

/** Registration-side business face bound onto every IM GUI slot. */
export interface ImGuiFace {
  hooks: {
    /** Live GUI snapshot bound as useGui. */
    gui: SnapshotStore<ImGuiSnapshot>
  }
  /** Connect DingTalk DWS or Wangwang; Wangwang secrets mint a credential reference only. */
  connect: (platform: ImPlatformId, displayName: string, creds?: WangwangCreds) => void
  /** Pause or resume automatic handling for one account. */
  setPaused: (accountId: string, paused: boolean) => void
  /** Mark one account disconnected. */
  disconnect: (accountId: string) => void
  /** Insert or replace one takeover rule. New rules stay disabled. */
  saveRoute: (workspaceId: string, draft: ImRouteDraft, existing?: ImRouteView) => void
  /** Enable or disable a rule without dropping its binding. */
  setRouteEnabled: (routeId: string, enabled: boolean) => void
  /** Bind or clear the workspace simulation target. */
  setSimulationTarget: (workspaceId: string, targetKey: string | undefined) => void
  /** Append a manual human_dsh send when automatic handling is off. */
  manualSend: (text: string) => void
  /** Switch the conversation strip between live / disabled / offline / unknown. */
  setPanel: (panel: ImGuiSnapshot['conversation']['panel']) => void
  /** Switch the conversation tab between simulated-user and tested-agent views. */
  setRole: (role: ImGuiSnapshot['conversation']['role']) => void
}
