/**
 * Pure types of the Session-owned Browser Workspace: the one home of the
 * `browserWorkspace` projection-key declaration and its durable payload.
 * @module @deepseek-ai/dsh-browser-workspace/types
 */

import type {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserTabId,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'

/** One open tab retained by a Session-owned browser instance. */
export interface BrowserWorkspaceTabRecord {
  readonly tabId: BrowserTabId
}

/** One browser instance retained by a Session-owned Browser Workspace. */
export interface BrowserWorkspaceInstanceRecord {
  readonly browserId: BrowserInstanceId
  readonly tabs: readonly BrowserWorkspaceTabRecord[]
  readonly activeTabId: BrowserTabId | null
}

/** One Browser Workspace retained by a Session. */
export interface BrowserWorkspaceRecord {
  readonly workspaceId: BrowserWorkspaceId
  readonly profileId: BrowserProfileId
  readonly browsers: readonly BrowserWorkspaceInstanceRecord[]
  readonly activeBrowserId: BrowserInstanceId | null
}

/** Whole Session-owned Browser Workspace projection. */
export interface BrowserWorkspaceProjection {
  readonly dockOpen: boolean
  readonly dockWidth: number
  readonly workspaces: readonly BrowserWorkspaceRecord[]
  readonly activeWorkspaceId: BrowserWorkspaceId | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * Session-owned Browser Workspace snapshot folded from `browser/workspace`.
     * Whole-value rule: every logged change carries the complete post-change state.
     */
    browserWorkspace: BrowserWorkspaceProjection
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whole Session-owned Browser Workspace snapshot. Log-only, last-wins.
     * Carries dock visibility and width plus every owned instance and tab so
     * Session switch, reload, and replay restore the same Workspace without
     * exposing another Session's tabs.
     */
    'browser/workspace': BrowserWorkspaceProjection
  }
}
