/**
 * Injected faces of the Browser Dock and collapsed preview. Live Workspace
 * facts arrive through `useProjection('browserWorkspace')`; inject carries
 * only mutation verbs and page observation.
 */

import type {
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
  BrowserWorkspaceProjection,
} from '@deepseek-ai/dsh-browser-workspace/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** Dock occupancy verbs closed over the current Session. */
export interface BrowserDockActions {
  /** Persist Dock open or collapsed for this Session. */
  setDock: (open: boolean, width?: number) => Promise<BrowserWorkspaceProjection>
  /** Focus one Session-owned tab. */
  focus: (target: BrowserTarget, expectedRevision: number) => Promise<BrowserPageState>
  /** Reload the current tab by navigating to its last observed URL. */
  refresh: (target: BrowserTarget, expectedRevision: number, url: string) => Promise<BrowserPageState>
  /** Observe one Session-owned tab. */
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>
  /** Capture one Session-owned tab. */
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>
  /** Record reported human ownership of the current tab. */
  takeover: (target: BrowserTarget, expectedRevision: number) => Promise<BrowserPageState>
  /** Record reported Agent ownership of the current tab. */
  returnControl: (target: BrowserTarget, expectedRevision: number) => Promise<BrowserPageState>
  /** Close one Session-owned tab. */
  close: (target: BrowserTarget, expectedRevision: number) => Promise<unknown>
}

/**
 * Unwrap one generated Remote result or throw the reported failure.
 * @param result - Settling Remote result from a generated namespace method.
 * @returns the success value.
 */
export async function unwrapRemote<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const settled = await result
  if (!settled.ok) throw new Error(settled.error.message)
  return settled.value
}

/** Collapsed preview verbs: select a back layer or reopen the Dock. */
export interface BrowserPreviewActions {
  /** Persist Dock open for this Session. */
  openDock: () => Promise<BrowserWorkspaceProjection>
  /** Focus one Session-owned tab without opening the Dock. */
  focus: (target: BrowserTarget, expectedRevision: number) => Promise<BrowserPageState>
  /** Observe one Session-owned tab. */
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>
  /** Capture one Session-owned tab. */
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>
}
