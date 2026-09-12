/** Official Browser fallback and external-link routing. */
import { useSyncExternalStore, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {
  SidebarRightTabDefinition, SidebarRightTabPayload,
  ISidebarRight, SidebarRightPreferencesReader, TabId,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IframeBrowser } from '../BrowserView.tsx'
import { registerLinkInterception } from '../link-intercept.ts'
import { t } from '../locales.ts'
import {
  OFFICIAL_BROWSER_FALLBACK_ID, OFFICIAL_BROWSER_KIND, officialBrowserPayloadOf,
  officialBrowserSettings, officialBrowserTargetKey,
} from '../../official-browser.ts'

/** Services used by the Browser fallback and its single document handler. */
export const OFFICIAL_BROWSER_INJECT = [
  'slots', 'sidebarRight', 'sidebarRightTabs', 'sidebarRightPreferences',
] as const

/** Official Browser registration context. */
export type OfficialBrowserContext = ClientContext
type SidebarRightTabRegistry = ClientContext['sidebarRightTabs']

function fallbackDefinition(): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_BROWSER_FALLBACK_ID,
    kind: OFFICIAL_BROWSER_KIND,
    priority: 'builtin',
    order: 50,
    icon: 'browser',
    title: () => t('browser'),
    guide: [{ description: () => t('browserGuide') }],
    create: request => {
      const payload = officialBrowserPayloadOf(request.payload)
      return payload === undefined ? false : { title: request.title, payload }
    },
    dedupeKey: tab => {
      const target = officialBrowserPayloadOf(tab.payload)?.target
      return target === undefined ? undefined : officialBrowserTargetKey(target)
    },
    settings: { fields: officialBrowserSettings(key => t(key as never)) },
  }
}

interface BrowserBodyInjected {
  readonly preferences: SidebarRightPreferencesReader
}

type BrowserBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & BrowserBodyInjected

/** Render the supported iframe Browser when no Workspace implementation takes over. */
function OfficialIframeBrowserBody({ useTabInfo, preferences }: BrowserBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const snapshot = useSyncExternalStore(
    listener => preferences.subscribe(listener),
    () => preferences.getSnapshot().preferences,
  )
  const payload = officialBrowserPayloadOf(tab.payload) ?? {}
  return (
    <IframeBrowser
      initialUrl={payload.url}
      noSandbox={snapshot.browserNoSandbox}
      allowedLoopback={snapshot.browserAllowedLoopback}
      onNavigate={(url) => {
        let title = url
        try { title = new URL(url).hostname } catch { /* keep the URL */ }
        tab.actions.update({ payload: { ...payload, url }, title })
      }}
    />
  )
}

/** Open one URL through the highest-priority official URL target or Browser fallback. */
export async function openOfficialBrowserUrl(
  sidebar: ISidebarRight,
  tabs: SidebarRightTabRegistry,
  sessionId: SessionId | undefined,
  href: string,
  title?: string,
): Promise<TabId> {
  const url = new URL(href)
  const target = tabs.matchUrlTarget(url) ?? tabs.get(OFFICIAL_BROWSER_KIND)
  if (target === undefined) throw new Error('official Browser tab is not registered')
  const navigator = sessionId === undefined ? sidebar : sidebar.forSession(sessionId)
  return await navigator.openTab(target.kind, {
    instanceId: href,
    title: title ?? url.hostname,
    payload: { url: href } as SidebarRightTabPayload,
  })
}

/** Register the one document-level external-link handler against official inventory. */
export function registerOfficialBrowserLinkInterception(options: {
  readonly sidebar: ISidebarRight
  readonly tabs: SidebarRightTabRegistry
  readonly preferences: SidebarRightPreferencesReader
  readonly selfOrigin?: string
}): () => void {
  const { sidebar, tabs, preferences } = options
  return registerLinkInterception({
    selfOrigin: options.selfOrigin ?? window.location.origin,
    takeoverEnabled: (url) => {
      const current = preferences.getSnapshot().preferences
      if (!current.browserInterceptLinks) return false
      const protocolOn = url.protocol === 'https:'
        ? current.browserInterceptHttps
        : current.browserInterceptHttp
      if (!protocolOn) return false
      const target = tabs.matchUrlTarget(url) ?? tabs.get(OFFICIAL_BROWSER_KIND)
      return target !== undefined && tabs.isTabEnabled(target.id)
    },
    openInSidebar: (href) => {
      void openOfficialBrowserUrl(sidebar, tabs, undefined, href).catch((error: unknown) => {
        console.error('[dsh-better-sidebar] official link open failed:', error)
      })
    },
  })
}

/** Register the fallback definition, body, and one official link handler. */
export function registerOfficialBrowser(
  ctx: OfficialBrowserContext,
  options: { readonly interceptLinks?: boolean } = {},
): () => void {
  const disposers = [
    ctx.sidebarRightTabs.register(fallbackDefinition()),
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: OFFICIAL_BROWSER_FALLBACK_ID,
      inject: () => ({ preferences: ctx.sidebarRightPreferences }),
    }, OfficialIframeBrowserBody)),
  ]
  if (options.interceptLinks !== false) {
    disposers.push(registerOfficialBrowserLinkInterception({
      sidebar: ctx.sidebarRight,
      tabs: ctx.sidebarRightTabs,
      preferences: ctx.sidebarRightPreferences,
    }))
  }
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
  }
}
