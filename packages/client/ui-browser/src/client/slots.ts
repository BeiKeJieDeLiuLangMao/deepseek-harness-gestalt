/**
 * Injected faces of the Browser Dock and collapsed preview. Live Workspace
 * facts arrive through `useProjection('browserWorkspace')`; inject carries
 * only mutation verbs and page observation.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-workspace/client'

/**
 * Unwrap one Browser Workspace Remote result or throw its reported failure.
 * @param result - settling result from a generated Browser Workspace method.
 * @returns the successful payload.
 */
export async function unwrapRemote<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const settled = await result
  if (!settled.ok) {
    throw Object.assign(new Error(settled.error.message), { code: settled.error.code })
  }
  return settled.value
}

/** Official page chrome verbs closed over the current Session. */
export interface BrowserPageChromeActions {
  /** Reload the current tab by navigating to the Runtime's current URL. */
  refresh: (target: BrowserTarget, expectedRevision: number, url: string) => Promise<BrowserPageState>
  /** Observe one Session-owned tab. */
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>
  /** Capture one Session-owned tab. */
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>
}

/** Collapsed preview verbs: select a back layer or reveal the workbench tab. */
export interface BrowserPreviewActions {
  /** Reveal the official page in the current Session's workbench panel. */
  reveal: () => void
  /** Focus one Session-owned tab without opening the Dock. */
  focus: (target: BrowserTarget, expectedRevision: number) => Promise<BrowserPageState>
  /** Observe one Session-owned tab. */
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>
  /** Capture one Session-owned tab. */
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>
}
