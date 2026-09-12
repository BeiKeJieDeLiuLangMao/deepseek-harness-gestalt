/** Ephemeral cross-Session views over authoritative pinned occurrences. */
import type { LayoutState, PaneId, TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import { dockPaneIds } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightTabProjection } from './service.ts'

const PREFIX = 'pinned:'

/** One display-only tab mapped to its authoritative home projection. */
export interface SidebarRightPinnedView {
  readonly display: TabRecord
  readonly paneId: PaneId
  readonly home: SidebarRightTabProjection
}

/** Result of projecting visible pins into the first right dock pane. */
export interface SidebarRightPinnedLayout {
  readonly layout: LayoutState
  readonly views: ReadonlyMap<TabId, SidebarRightPinnedView>
  readonly activeId: TabId | undefined
}

function visibleTo(projection: SidebarRightTabProjection, viewerCwd: string | undefined): boolean {
  const pin = projection.state.pin
  if (pin === undefined) return false
  if (pin.scope === 'global' || pin.homeCwd === undefined || viewerCwd === undefined) return true
  return pin.homeCwd === viewerCwd
}

/**
 * Build a display identity outside the minted DockKit id space.
 * @param homeSessionId - authoritative Session.
 * @param tabId - authoritative occurrence id.
 * @returns display-only tab id.
 */
export function sidebarRightPinnedViewId(homeSessionId: SessionId, tabId: TabId): TabId {
  return `${PREFIX}${encodeURIComponent(homeSessionId)}:${encodeURIComponent(tabId)}` as TabId
}

/**
 * Test whether an id belongs only to the cross-Session display projection.
 * @param tabId - candidate tab id.
 * @returns whether the id is virtual.
 */
export function isSidebarRightPinnedViewId(tabId: TabId): boolean {
  return tabId.startsWith(PREFIX)
}

/**
 * Append visible foreign pins to the first right pane without writing them to
 * the viewer Session's store. The selected virtual id changes only this render.
 * @param layout - viewer Session's authoritative right layout.
 * @param pinned - authoritative home projections from the controller.
 * @param viewerSessionId - Session currently rendered by the workbench seat.
 * @param viewerCwd - current Session workspace, when hydrated.
 * @param requestedActiveId - locally selected virtual view.
 * @returns augmented layout and display-to-home mapping.
 */
export function projectSidebarRightPinnedViews(
  layout: LayoutState,
  pinned: readonly SidebarRightTabProjection[],
  viewerSessionId: SessionId,
  viewerCwd: string | undefined,
  requestedActiveId: TabId | undefined,
): SidebarRightPinnedLayout {
  const paneId = dockPaneIds(layout)[0]
  if (paneId === undefined) return { layout, views: new Map(), activeId: undefined }
  const views = new Map<TabId, SidebarRightPinnedView>()
  for (const home of pinned) {
    if (home.sessionId === viewerSessionId || !visibleTo(home, viewerCwd)) continue
    const id = sidebarRightPinnedViewId(home.sessionId, home.record.id)
    views.set(id, { display: { ...home.record, id }, paneId, home })
  }
  const activeId = requestedActiveId !== undefined && views.has(requestedActiveId) ? requestedActiveId : undefined
  if (views.size === 0) return { layout, views, activeId }
  const pane = layout.nodes[paneId]
  if (pane?.kind !== 'pane') throw new Error(`sidebarRight: dock pane "${paneId}" is unavailable for pinned views`)
  return {
    views,
    activeId,
    layout: {
      ...layout,
      nodes: {
        ...layout.nodes,
        [paneId]: {
          ...pane,
          tabs: [...pane.tabs, ...views.keys()],
          activeTabId: activeId ?? pane.activeTabId,
        },
      },
      tabs: {
        ...layout.tabs,
        ...Object.fromEntries([...views].map(([id, view]) => [id, view.display])),
      },
      activePaneId: activeId === undefined ? layout.activePaneId : paneId,
    },
  }
}
