/** Register Browser Workspace as the official Browser tab implementation. */
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserWorkspaceProjection } from '@deepseek-ai/dsh-browser-workspace/client'
import { listBrowserWorkspacePages } from '@deepseek-ai/dsh-browser-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-browser/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  OfficialBrowserRuntime, OfficialWorkbenchBrowserBody, OFFICIAL_BROWSER_KIND,
  OFFICIAL_WORKBENCH_BROWSER_ID, officialBrowserTargetKey, officialBrowserTargetOf,
  officialBrowserPayloadOf, workbenchBrowserDefinition,
} from './official-browser.tsx'
import { isDesktopOverlayDocument } from '../desktop-overlay-document.ts'

/** Exact services required before the official Workbench Browser registers. */
export const inject = [
  'slots', 'sessions', 'remote', 'remote.browserWorkspace', 'browserUi', 'locale',
  'sidebarRight', 'sidebarRightTabs', 'sidebarRightPreferences',
] as const

/** Preview navigation face published by this adapter. */
export interface WorkbenchBrowserFace {
  /**
   * Expand and focus the occurrence bound to the active Browser page.
   * @param sessionId - Session whose active Browser page should be revealed.
   */
  reveal(sessionId: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workbenchBrowser: WorkbenchBrowserFace
  }
}

interface SessionListRow {
  projectionValues?: { browserWorkspace?: BrowserWorkspaceProjection }
}

/**
 * Register the official Browser definition, body, and occurrence owner.
 * @param ctx - Browser Workspace and official Sidebar client services.
 */
export function apply(ctx: Context): void {
  const officialCtx = ctx
  const runtime = new OfficialBrowserRuntime(officialCtx)
  ctx.provide('workbenchBrowser', {
    reveal: (rawSessionId) => {
      if (isDesktopOverlayDocument()) return
      const sessionId = rawSessionId as SessionId
      const row = ctx.sessions.list.getSnapshot().byId[sessionId] as SessionListRow | undefined
      const page = listBrowserWorkspacePages(row?.projectionValues?.browserWorkspace).at(-1)
      if (page === undefined) return
      const key = officialBrowserTargetKey(page.target)
      const existing = ctx.sidebarRight.getSnapshot().sessions
        .find(session => session.sessionId === sessionId)?.tabs
        .find(tab => tab.record.kind === OFFICIAL_BROWSER_KIND
          && officialBrowserTargetKey(officialBrowserTargetOf(tab.state.payload) ?? page.target) === key)
      void ctx.sidebarRight.forSession(sessionId).openTab(OFFICIAL_BROWSER_KIND, {
        instanceId: key,
        title: existing?.record.title ?? page.url ?? 'Browser',
        payload: officialBrowserPayloadOf(existing?.state.payload) ?? {
          target: { ...page.target },
          ...(page.url === undefined ? {} : { url: page.url }),
        },
      }).catch((error: unknown) => {
        console.error('[ui-workbench] revealing Browser occurrence failed:', error)
      })
    },
  })
  if (isDesktopOverlayDocument()) return
  ctx.effect(() => {
    const disposers = [
      ctx.sidebarRightTabs.register(workbenchBrowserDefinition(officialCtx, runtime)),
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: OFFICIAL_WORKBENCH_BROWSER_ID,
        inject: () => ({ ctx: officialCtx, runtime }),
      }, OfficialWorkbenchBrowserBody)),
      runtime.subscribe(),
    ]
    return () => {
      for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
    }
  }, 'ui-workbench: official Browser')
}
