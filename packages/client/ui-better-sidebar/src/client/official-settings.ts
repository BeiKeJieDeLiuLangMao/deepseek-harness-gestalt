/** Register the Better settings page over official Sidebar inventory and preferences. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarContext } from '../context-types.ts'
import { t } from './locales.ts'
import { SideCardSection } from './SideCardSection.tsx'

/** Exact services required by the official settings contribution. */
export const OFFICIAL_SETTINGS_INJECT = [
  'slots',
  'sidebarRightTabs',
  'sidebarRightPreferences',
] as const

/** Client context required by the official settings contribution. */
export type OfficialSettingsContext = SidebarContext & Pick<
  ClientContext,
  'sidebarRightTabs' | 'sidebarRightPreferences'
>

/** Register the settings section and its root-scoped custom descriptor seats. */
export function registerOfficialSidebarSettings(ctx: OfficialSettingsContext): () => void {
  return ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'better-sidebar',
    order: 100,
    label: () => t('settingsNav'),
    children: {
      'sidebar.right.tab.settings': { kind: 'keyed', scope: 'root' },
      'sidebar.right.viewer.settings': { kind: 'keyed', scope: 'root' },
    },
    inject: () => ({
      tabs: ctx.sidebarRightTabs,
      preferences: ctx.sidebarRightPreferences,
    }),
  }, SideCardSection))
}
