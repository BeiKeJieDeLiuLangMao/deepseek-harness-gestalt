/** Official IM conversation tab definition. */
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** Official singleton IM conversation kind. */
export const IM_TAB_ID = 'im-conversation'
/** Stable official definition id. */
export const IM_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-im/conversation'
/** + menu position after Phone. */
export const IM_TAB_ORDER = 56

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabPayloadMap {
    'im-conversation': Record<string, never>
  }
}

/**
 * Build the official singleton IM conversation descriptor.
 * @param title - localized tab title.
 * @param guide - localized guide description.
 */
export function buildOfficialImDefinition(
  title: () => string,
  guide: () => string,
): SidebarRightTabDefinition {
  return {
    id: IM_DEFINITION_ID,
    kind: IM_TAB_ID,
    priority: 'builtin',
    order: IM_TAB_ORDER,
    icon: 'chat',
    title: () => title(),
    guide: [{ description: guide }],
    single: true,
    create: () => ({ title: title(), payload: {} }),
    dedupeKey: () => IM_TAB_ID,
  }
}
