/** Injected mutation face for the Session Schedule task board. */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'

/** Settled Host mutation result; durable state arrives through the projection. */
export type ScheduleActionResult = RemoteResult<unknown>

/** Remote Schedule verbs available to one Session-scoped header entry. */
export interface ScheduleActions {
  /** Pause one deliverable reminder. */
  onPause: (id: ScheduleId) => Promise<ScheduleActionResult>
  /** Resume one paused reminder. */
  onResume: (id: ScheduleId) => Promise<ScheduleActionResult>
  /** Delete one retained reminder. */
  onDelete: (id: ScheduleId) => Promise<ScheduleActionResult>
}
