/** Session Schedule header action wired to projection state and Host Remote mutations. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import { ScheduleListAction } from './ScheduleListAction.tsx'
import { en, NS, zh, type ScheduleKey } from './locales.ts'
import type { ScheduleActions } from './slots.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session Schedule task-board copy. */
    schedule: ScheduleKey
  }
}

/** Required services for the Session projection, header slot, Remote namespace, and copy. */
export const inject = ['sessions', 'slots', 'remote', 'remote.schedules', 'locale']

/** Register the A-variant Schedule action immediately after background jobs. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-schedule: dictionaries')
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'schedule-list',
    order: 30,
    locale: NS,
    inject: (sessionId): ScheduleActions => ({
      onPause: async (id: ScheduleId) => await ctx.remote.schedules.pause(sessionId, id),
      onResume: async (id: ScheduleId) => await ctx.remote.schedules.resume(sessionId, id),
      onDelete: async (id: ScheduleId) => await ctx.remote.schedules.delete(sessionId, id),
    }),
  }, ScheduleListAction))
}
