/** Slot-owned tab information derived from framework-bound store and navigation hooks. */
import { useMemo, useSyncExternalStore } from 'react'
import { findTabPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { HostObservable, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabActions, SidebarRightTabNavigation, UseSidebarRightTabInfo } from './contract/slots.ts'
import type { createSidebarRightStore } from './stores.ts'
import type { SidebarWorkbenchSurface } from './stores.ts'
import type { SidebarRightPinnedView } from './pinned-views.ts'

/** Stable dispatch identity and framework hooks; never passed as tab component props. */
export interface TabHookContext {
  readonly tabId: TabId
  readonly surface: SidebarWorkbenchSurface
  readonly title: boolean
  readonly fullscreen: boolean
  readonly signal: AbortSignal
  readonly actions: SidebarRightTabActions
  readonly useStore: PropsStore<ReturnType<typeof createSidebarRightStore>>['useStore']
  readonly navigation: HostObservable<SidebarRightTabNavigation>
  /** Display-only foreign pin whose authoritative record remains in its home Session. */
  readonly pinned?: SidebarRightPinnedView
  readonly pinnedActive?: boolean
}

/**
 * Bind a tab occurrence without subscribing or creating records during factory evaluation.
 * @param standard - framework session identity.
 * @param context - stable record lifetime and framework-bound readers.
 * @returns the tab information hook.
 */
export const tabInfoFactory: SlotHookFactory<'sidebar.right.pane.tab', UseSidebarRightTabInfo> = (standard, context) => {
  const { sessionId } = standard
  const { tabId, surface, title, fullscreen, signal, actions, useStore, navigation: navigationSource, pinned } = context
  return function useTabInfo() {
    const session = useStore(state => state.bySession[sessionId])
    const navigation = useSyncExternalStore(
      listener => navigationSource.subscribe(listener),
      () => navigationSource.getSnapshot(),
      () => navigationSource.getSnapshot(),
    )
    return useMemo(() => {
      if (pinned !== undefined) {
        const expanded = session?.layout.expanded ?? false
        return {
          workbench: { surface },
          sidebar: { expanded, fullscreen },
          panel: { id: pinned.paneId },
          tab: {
            ...pinned.home.record,
            sessionId: pinned.home.sessionId,
            virtual: true,
            visible: expanded && (title || context.pinnedActive === true),
            navigation,
            payload: pinned.home.state.payload,
            pin: pinned.home.state.pin,
            signal,
            actions,
          },
        }
      }
      const layout = surface === 'right' ? session?.layout : session?.bottom.layout
      const tab = layout?.tabs[tabId]
      if (layout === undefined || tab === undefined || signal.aborted) {
        throw new Error(`sidebarRight: tab "${tabId}" is not committed in session "${sessionId}"`)
      }
      const pane = findTabPane(layout, tabId)
      return {
        workbench: { surface },
        sidebar: { expanded: layout.expanded, fullscreen },
        panel: { id: pane.id },
        tab: {
          ...tab,
          sessionId,
          virtual: false,
          visible: pane.host === 'float' || (layout.expanded && (title || pane.activeTabId === tabId)),
          navigation,
          payload: session?.tabs[tabId]?.payload,
          pin: session?.tabs[tabId]?.pin,
          signal,
          actions,
        },
      }
    }, [session, navigation, tabId, surface, title, fullscreen, signal, actions, pinned, context.pinnedActive])
  }
}

/**
 * Forward the framework-bound tab hook to a guide replacement.
 * @param _standard - the guide's framework standard props.
 * @param useTabInfo - the enclosing tab's framework-bound reader.
 * @returns the same reader for the replacement.
 */
export const guideTabInfoFactory: SlotHookFactory<'sidebar.right.tab.guide', UseSidebarRightTabInfo> =
  (_standard, useTabInfo) => useTabInfo
