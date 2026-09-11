/**
 * IM GUI plugin, browser half: Settings → IM Accounts, workspace IM Takeover
 * and IM Simulation cards, and the Better Sidebar IM conversation tab.
 * Native approval remains the only approval surface.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AccountsSection } from './AccountsSection.tsx'
import { TakeoverSection } from './TakeoverSection.tsx'
import { SimulationSection } from './SimulationSection.tsx'
import { ConversationTab } from './ConversationTab.tsx'
import { createHostImGuiFace } from './host-controller.ts'
import { createImGuiStore, emptyGuiSnapshot } from './model.ts'
import { buildOfficialImDefinition, IM_DEFINITION_ID } from './registry.ts'
import { en, NS, zh, type ImKey } from './locales.ts'

export { AccountsSection } from './AccountsSection.tsx'
export { TakeoverSection } from './TakeoverSection.tsx'
export { SimulationSection } from './SimulationSection.tsx'
export { ConversationTab } from './ConversationTab.tsx'
export { createImGuiFace } from './controller.ts'
export { createHostImGuiFace } from './host-controller.ts'
export { createImGuiStore, emptyGuiSnapshot, prototypeGuiSnapshot } from './model.ts'
export {
  conversationMessagesFromRecords, deliveryStateOf, IM_LIVE_LANE_BEHAVIORS, senderBadgeOf,
} from './presentation.ts'
export { IM_DEFINITION_ID, IM_TAB_ID, buildOfficialImDefinition } from './registry.ts'
export { en, NS, zh } from './locales.ts'
export type { ImKey } from './locales.ts'
export type { ImGuiFace } from './faces.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** IM GUI copy shared by settings, workspace cards, and the Sidebar tab. */
    'settings.im': ImKey
  }
}

/** Services required before activation. */
export const inject = [
  'slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.imConfig', 'remote.imDelivery', 'uiWorkspace',
] as const

/**
 * Register IM Accounts, workspace takeover/simulation cards, and the Sidebar tab.
 * @param ctx - client context carrying settings, workspace, and Sidebar services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-im: dictionaries')
  const face = createHostImGuiFace(
    createImGuiStore(emptyGuiSnapshot()),
    ctx.remote.imConfig,
    ctx.remote.imDelivery,
    ctx.uiWorkspace,
  )
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'im-accounts',
    order: 45,
    label: () => t('nav'),
    locale: NS,
    inject: () => face,
  }, AccountsSection))
  ctx.slots.inject('workspace.settings.section', () => ctx.slots.register({
    name: 'workspace.settings.section',
    id: 'im-takeover',
    order: 10,
    locale: NS,
    inject: () => face,
  }, TakeoverSection))
  ctx.slots.inject('workspace.settings.section', () => ctx.slots.register({
    name: 'workspace.settings.section',
    id: 'im-simulation',
    order: 20,
    locale: NS,
    inject: () => face,
  }, SimulationSection))
  ctx.effect(() => {
    const disposeTab = ctx.sidebarRightTabs.register(buildOfficialImDefinition(
      () => t('tab'),
      () => t('tabGuide'),
    ))
    const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: IM_DEFINITION_ID,
      locale: NS,
      inject: () => face,
    }, ConversationTab))
    return () => {
      disposeBody()
      disposeTab()
    }
  }, 'ui-im: official IM conversation')
}
