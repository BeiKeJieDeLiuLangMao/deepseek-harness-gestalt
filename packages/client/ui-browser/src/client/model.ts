/**
 * Pure Browser Dock occupancy helpers over one Session Workspace snapshot.
 * @module @deepseek-ai/dsh-client-ui-browser/client/model
 */

import type {
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
  BrowserWorkspaceInstanceRecord,
  BrowserWorkspaceProjection,
  BrowserWorkspaceRecord,
  BrowserWorkspaceTabRecord,
} from '@deepseek-ai/dsh-browser-workspace/client'

/** Occupant-specific details range consumed by AppFrame. */
export const BROWSER_DOCK_WIDTH_RANGE = {
  minimum: 420,
  default: 640,
  maximum: 960,
} as const

/** One tab the Dock or collapsed preview can address. */
export interface BrowserDockTab {
  readonly target: BrowserTarget
  readonly controlOwner: BrowserWorkspaceTabRecord['controlOwner']
  readonly revision: number
  readonly active: boolean
}

/** Active Workspace and instance plus every tab the Dock can show. */
export interface BrowserDockSelection {
  readonly workspace: BrowserWorkspaceRecord
  readonly instance: BrowserWorkspaceInstanceRecord
  readonly tabs: readonly BrowserDockTab[]
  readonly activeTab: BrowserDockTab | undefined
}

/**
 * True when this Session owns at least one Browser Workspace tab.
 * @param snapshot - Session-owned Workspace projection, or undefined while loading.
 * @returns whether the Dock or collapsed preview has anything to show.
 */
export function hasBrowserTabs(snapshot: BrowserWorkspaceProjection | null | undefined): boolean {
  return (snapshot?.workspaces.length ?? 0) > 0
}

/**
 * Resolve the Session's active Workspace, instance, and tab stack.
 * @param snapshot - Session-owned Workspace projection.
 * @returns the active selection, or undefined when no tab exists.
 */
export function selectBrowserDock(snapshot: BrowserWorkspaceProjection | null | undefined): BrowserDockSelection | undefined {
  if (snapshot === undefined || snapshot === null) return undefined
  const workspace = namedOrLast(snapshot.workspaces, snapshot.activeWorkspaceId, item => item.workspaceId)
  if (workspace === undefined) return undefined
  const instance = namedOrLast(workspace.browsers, workspace.activeBrowserId, item => item.browserId)
  if (instance === undefined) return undefined
  const tabs = instance.tabs.map(tab => ({
    target: {
      profileId: workspace.profileId,
      workspaceId: workspace.workspaceId,
      browserId: instance.browserId,
      tabId: tab.tabId,
    } satisfies BrowserTarget,
    controlOwner: tab.controlOwner,
    revision: tab.revision,
    active: tab.tabId === instance.activeTabId,
  }))
  return {
    workspace,
    instance,
    tabs,
    activeTab: tabs.find(tab => tab.active) ?? tabs.at(-1),
  }
}

/**
 * Stack order for collapsed layers: inactive tabs first, current tab last.
 * @param tabs - Tabs of the active instance.
 * @returns back-to-front layers so the current tab is clickable on top.
 */
export function stackedBrowserTabs(tabs: readonly BrowserDockTab[]): readonly BrowserDockTab[] {
  const active = tabs.find(tab => tab.active)
  if (active === undefined) return tabs
  return [...tabs.filter(tab => !tab.active), active]
}

/**
 * Host name shown in the address field, or the raw URL when parsing fails.
 * @param url - Committed page URL.
 * @returns display host or the original URL.
 */
export function browserAddressHost(url: string): string {
  try {
    const host = new URL(url).host
    return host === '' ? url : host
  } catch {
    return url
  }
}

/**
 * Title shown on a tab chip or collapsed layer.
 * @param page - Observed open page, or undefined while loading.
 * @param untitled - Localized untitled fallback.
 * @returns page title, host, or untitled.
 */
export function browserTabTitle(page: BrowserPageState | undefined, untitled: string): string {
  const title = page?.title.trim()
  if (title !== undefined && title !== '') return title
  if (page !== undefined) return browserAddressHost(page.url)
  return untitled
}

/**
 * Address-field Profile label, if any.
 * @param page - Observed open page.
 * @param sharedLabel - Chrome copy for the shared Profile.
 * @returns the named persistent Profile, the shared-identity label, or undefined for a temporary Profile.
 */
export function persistentProfileLabel(
  page: BrowserPageState | undefined,
  sharedLabel: string,
): string | undefined {
  if (page?.chrome.kind === 'shared') return sharedLabel
  return page?.chrome.kind === 'persistent' ? page.chrome.name : undefined
}

/**
 * PNG data URL for one captured screenshot.
 * @param screenshot - Captured page image.
 * @returns a browser-displayable data URL.
 */
export function screenshotDataUrl(screenshot: BrowserScreenshot | undefined): string | undefined {
  if (screenshot === undefined) return undefined
  return `data:${screenshot.mediaType};base64,${screenshot.data}`
}

/**
 * Open-page facts from one observe result.
 * @param state - Observe result.
 * @returns the open page, or undefined when the tab is closed or unavailable.
 */
export function openPageOf(state: BrowserRuntimeState | undefined): BrowserPageState | undefined {
  return state?.status === 'open' ? state : undefined
}

function namedOrLast<T>(
  items: readonly T[],
  id: string | null,
  keyOf: (item: T) => string,
): T | undefined {
  if (id !== null) {
    const named = items.find(item => keyOf(item) === id)
    if (named !== undefined) return named
  }
  return items.at(-1)
}
