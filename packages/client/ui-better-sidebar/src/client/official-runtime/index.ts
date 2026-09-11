/** Register Side Chat and Terminal runtimes on the official workbench. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  SidebarRightDescriptorContext, SidebarRightDescriptorTab, SidebarRightTabCreateRequest,
  SidebarRightTabDefinition, TabId,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarContext } from '../../context-types.ts'
import { api } from '../api.ts'
import { t } from '../locales.ts'
import { TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN } from '../../prefs-shared.ts'
import type { TerminalPreferenceSource } from '../TerminalView.tsx'
import { OfficialSidechatBody } from './SideChatBody.tsx'
import {
  closeOfficialSidechat, interceptOfficialSidechatCatalogOpen, subscribeOfficialSidechatRuntime,
} from './sidechat-runtime.ts'
import {
  createOfficialSidechatPayload, createOfficialUiTerminalPayload,
  OFFICIAL_SIDECHAT_KIND, OFFICIAL_TERMINAL_KIND,
  officialSidechatPayloadOf, officialTerminalPayloadOf,
} from './payload.ts'
import { OfficialTerminalBody } from './TerminalBody.tsx'
import { OfficialTerminalPinMenuItem } from './TerminalPinMenuItem.tsx'
import {
  canOpenOfficialUiTerminal, closeOfficialTerminal, OFFICIAL_UI_TERMINAL_LIMIT, officialUiTerminalCount,
  subscribeOfficialAgentTerminals,
} from './terminal-runtime.ts'

/** Stable official definition ids used by keyed body registrations and preference maps. */
export const OFFICIAL_SIDECHAT_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/sidechat'
export const OFFICIAL_TERMINAL_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/terminal'

/** Exact Cordis services required before official runtime tabs register. */
export const OFFICIAL_RUNTIME_INJECT = [
  'slots',
  'sidebarRight',
  'sidebarRightTabs',
  'sidebarRightPreferences',
  'sessions',
  'workspaces',
  'uiRenderer',
] as const

/** Client context that satisfies every official runtime registration. */
export type OfficialRuntimeContext = SidebarContext & Pick<
  ClientContext,
  'sidebarRight' | 'sidebarRightTabs' | 'sidebarRightPreferences'
>

function runtimeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function pageInstanceAddress(kind: string, instanceId: string): string {
  return `sidebar://${kind}/${encodeURIComponent(instanceId)}`
}

function terminalCount(context: SidebarRightDescriptorContext): number {
  return context.tabs.filter((tab) => {
    if (tab.kind !== OFFICIAL_TERMINAL_KIND) return false
    return officialTerminalPayloadOf(tab.payload)?.owner === 'ui'
  }).length
}

function sidechatDefinition(ctx: OfficialRuntimeContext): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_SIDECHAT_DEFINITION_ID,
    kind: OFFICIAL_SIDECHAT_KIND,
    priority: 'builtin',
    order: 35,
    icon: 'sidechat',
    title: () => t('sideChat'),
    guide: [{ description: () => t('sideChatGuide') }],
    create: (request: SidebarRightTabCreateRequest) => {
      if (request.payload !== undefined) {
        const payload = officialSidechatPayloadOf(request.payload)
        if (payload === undefined) return false
        return {
          contentId: pageInstanceAddress(OFFICIAL_SIDECHAT_KIND, payload.rootThreadId),
          title: request.title,
          payload,
        }
      }
      const payload = createOfficialSidechatPayload(SessionId(`session-${runtimeId()}`))
      return {
        contentId: pageInstanceAddress(OFFICIAL_SIDECHAT_KIND, payload.rootThreadId),
        title: t('sideChatUntitled'),
        payload,
      }
    },
    dedupeKey: (tab: SidebarRightDescriptorTab) => officialSidechatPayloadOf(tab.payload)?.rootThreadId,
    close: close => closeOfficialSidechat(ctx, close),
  }
}

function terminalDefinition(
  ctx: OfficialRuntimeContext,
  hostTitle: () => string | undefined,
  resolveHostTitle: () => Promise<string | undefined>,
): SidebarRightTabDefinition {
  const fallbackTitle = (): string => t('terminal')
  const withinLimit = (context: SidebarRightDescriptorContext): boolean => {
    return terminalCount(context) < OFFICIAL_UI_TERMINAL_LIMIT
  }
  return {
    id: OFFICIAL_TERMINAL_DEFINITION_ID,
    kind: OFFICIAL_TERMINAL_KIND,
    priority: 'builtin',
    order: 40,
    icon: 'terminal',
    title: fallbackTitle,
    available: withinLimit,
    unavailableReason: () => t('terminalUnavailable'),
    guide: [{ description: () => t('terminalGuide') }],
    create: (request: SidebarRightTabCreateRequest) => {
      if (request.payload !== undefined) {
        const payload = officialTerminalPayloadOf(request.payload)
        if (payload === undefined) return false
        return { title: request.title, payload }
      }
      if (!withinLimit(request)) return false
      const payload = createOfficialUiTerminalPayload(`terminal:${runtimeId()}`)
      return {
        contentId: pageInstanceAddress(OFFICIAL_TERMINAL_KIND, payload.runtimeId),
        title: hostTitle() ?? fallbackTitle(),
        payload,
      }
    },
    dedupeKey: (tab: SidebarRightDescriptorTab) => {
      const payload = officialTerminalPayloadOf(tab.payload)
      return payload === undefined ? undefined : `${payload.owner}:${payload.runtimeId}`
    },
    onOpen: (tab, context) => {
      const payload = officialTerminalPayloadOf(tab.payload)
      if (payload?.owner !== 'ui' || tab.title !== fallbackTitle()) return
      void resolveHostTitle().then((title) => {
        if (title !== undefined) {
          ctx.sidebarRight.forSession(context.sessionId).update(tab.id as TabId, { title })
        }
      })
    },
    settings: {
      fields: [{
        key: 'agentTerminalTools',
        source: 'preference',
        title: () => t('settingsToolsTitle'),
        description: () => t('settingsToolsDesc'),
      }, {
        key: 'bottomPanelAutoTerminal',
        source: 'preference',
        title: () => t('settingsBottomTerminalTitle'),
        description: () => t('settingsBottomTerminalDesc'),
      }, {
        key: 'terminalShell',
        source: 'preference',
        control: 'text',
        title: () => t('settingsShellTitle'),
        description: () => t('settingsShellDesc'),
        placeholder: t('settingsShellPlaceholder'),
      }, {
        key: 'terminalShellArgs',
        source: 'preference',
        control: 'text',
        title: () => t('settingsShellArgsTitle'),
        description: () => t('settingsShellArgsDesc'),
        placeholder: t('settingsShellArgsPlaceholder'),
      }, {
        key: 'terminalFontFamily',
        source: 'preference',
        control: 'text',
        title: () => t('settingsFontFamilyTitle'),
        description: () => t('settingsFontFamilyDesc'),
        placeholder: t('settingsFontFamilyPlaceholder'),
      }, {
        key: 'terminalFontSize',
        source: 'preference',
        control: 'number',
        title: () => t('settingsFontSizeTitle'),
        description: () => t('settingsFontSizeDesc'),
        min: TERMINAL_FONT_SIZE_MIN,
        max: TERMINAL_FONT_SIZE_MAX,
        unit: 'px',
      }],
    },
    close: closeOfficialTerminal,
  }
}

function bottomOpenedBySession(ctx: OfficialRuntimeContext): ReadonlyMap<SessionId, boolean> {
  return new Map(ctx.sidebarRight.getSnapshot().sessions.map(session => [session.sessionId, session.bottomOpenedOnce]))
}

/** Open one UI Terminal when a Session commits its first bottom-panel expansion. */
export function subscribeOfficialBottomTerminal(ctx: OfficialRuntimeContext): () => void {
  let previous = bottomOpenedBySession(ctx)
  return ctx.sidebarRight.subscribe(() => {
    const projection = ctx.sidebarRight.getSnapshot()
    const next = new Map(projection.sessions.map(session => [session.sessionId, session.bottomOpenedOnce]))
    const opened = projection.sessions.filter(session => previous.get(session.sessionId) === false
      && session.bottomOpenedOnce)
    previous = next
    for (const session of opened) {
      const preferences = ctx.sidebarRightPreferences.getSnapshot().preferences
      if (!preferences.bottomPanelAutoTerminal) continue
      if (!ctx.sidebarRightTabs.isTabEnabled(OFFICIAL_TERMINAL_DEFINITION_ID)) continue
      if (!canOpenOfficialUiTerminal(projection, session.sessionId)) continue
      void ctx.sidebarRight.forSession(session.sessionId).openTab(OFFICIAL_TERMINAL_KIND, { surface: 'bottom' })
        .catch((error: unknown) => {
          console.error('[dsh-better-sidebar] open first bottom Terminal failed:', error)
        })
    }
  })
}

/**
 * Register Side Chat, UI Terminal, model Terminal feed, and Terminal pins on
 * the official workbench.
 * @param ctx - client services listed in {@link OFFICIAL_RUNTIME_INJECT}.
 * @returns disposer for every definition, Slot contribution, and runtime subscription.
 */
export function registerOfficialRuntimeTabs(
  ctx: OfficialRuntimeContext,
  options: { readonly subscribe?: boolean } = {},
): () => void {
  let latestHostTitle: string | undefined
  const hostTitleRequest = api.shellGet().then((value) => {
    latestHostTitle = value.name
    return latestHostTitle
  }).catch(() => undefined)
  const preferences: TerminalPreferenceSource = {
    getSnapshot: () => ctx.sidebarRightPreferences.getSnapshot().preferences,
    subscribe: listener => ctx.sidebarRightPreferences.subscribe(listener),
  }
  const disposers: (() => void)[] = [
    ctx.sidebarRightTabs.register(sidechatDefinition(ctx)),
    ctx.sidebarRightTabs.register(terminalDefinition(ctx, () => latestHostTitle, () => hostTitleRequest)),
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: OFFICIAL_SIDECHAT_DEFINITION_ID,
      inject: () => ({ ctx }),
    }, OfficialSidechatBody)),
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: OFFICIAL_TERMINAL_DEFINITION_ID,
      inject: () => ({ ctx, preferences }),
    }, OfficialTerminalBody)),
    ctx.slots.inject('sidebar.right.tab.menu.item', () => ctx.slots.register({
      name: 'sidebar.right.tab.menu.item',
      id: `${OFFICIAL_TERMINAL_DEFINITION_ID}/pin`,
      inject: () => ({ ctx }),
    }, OfficialTerminalPinMenuItem)),
  ]
  if (options.subscribe !== false) {
    disposers.push(
      interceptOfficialSidechatCatalogOpen(ctx.sessions, ctx),
      subscribeOfficialSidechatRuntime(ctx),
      subscribeOfficialAgentTerminals(ctx),
      subscribeOfficialBottomTerminal(ctx),
    )
  }
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
  }
}

export { officialUiTerminalCount }
