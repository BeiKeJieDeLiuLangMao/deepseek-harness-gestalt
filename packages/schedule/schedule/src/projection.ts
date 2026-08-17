/** Pure Schedule unit for the standard Session projection transport. */

import { z } from 'zod'
import type { ZodType } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { advanceDispatchedSchedule, decodeScheduleChange, ScheduleLogError } from './domain.ts'
import type {
  ScheduleChange,
  ScheduleId,
  ScheduleProjection,
  ScheduleProjectionItem,
  ScheduleRecord,
} from './types.ts'

/** Plain-JSON fold state persisted by the projection cache. */
export interface ScheduleProjectionState {
  readonly schedules: readonly { readonly record: ScheduleRecord; readonly paused: boolean }[]
  readonly seenIds: readonly ScheduleId[]
}

/**
 * Construct a fresh empty projection state.
 * @returns Plain empty state with no retained or seen identities.
 */
export function emptyScheduleProjectionState(): ScheduleProjectionState {
  return Object.freeze({ schedules: Object.freeze([]), seenIds: Object.freeze([]) })
}

/** Replace one retained entry without changing its create-order position. */
function replace(
  state: ScheduleProjectionState,
  index: number,
  record: ScheduleRecord,
  paused: boolean,
): ScheduleProjectionState {
  const schedules = [...state.schedules]
  schedules[index] = Object.freeze({ record, paused })
  return Object.freeze({ schedules: Object.freeze(schedules), seenIds: state.seenIds })
}

/** Apply one decoded change, returning the same reference for invalid transitions. */
function applyChange(state: ScheduleProjectionState, change: ScheduleChange): ScheduleProjectionState {
  if (change.operation === 'create') {
    if (state.seenIds.includes(change.schedule.id)) return state
    return Object.freeze({
      schedules: Object.freeze([
        ...state.schedules,
        Object.freeze({ record: change.schedule, paused: false }),
      ]),
      seenIds: Object.freeze([...state.seenIds, change.schedule.id]),
    })
  }

  const index = state.schedules.findIndex(schedule => schedule.record.id === change.id)
  if (index < 0) return state
  const current = state.schedules[index]
  /* v8 ignore next -- findIndex established the indexed entry. */
  if (current === undefined) return state

  switch (change.operation) {
    case 'delete':
      return Object.freeze({
        schedules: Object.freeze(state.schedules.filter((_schedule, candidate) => candidate !== index)),
        seenIds: state.seenIds,
      })
    case 'pause':
      return current.paused ? state : replace(state, index, current.record, true)
    case 'resume':
      return current.paused ? replace(state, index, current.record, false) : state
    case 'dispatch': {
      if (current.paused) return state
      let next: ScheduleRecord | undefined
      try {
        next = advanceDispatchedSchedule(current.record, change)
      } catch (_invalidDispatch) {
        return state
      }
      if (next !== undefined) return replace(state, index, next, false)
      return Object.freeze({
        schedules: Object.freeze(state.schedules.filter((_schedule, candidate) => candidate !== index)),
        seenIds: state.seenIds,
      })
    }
  }
}

/**
 * Fold one committed Session event into the Schedule projection.
 * @param state - Plain retained-record state covering prior owned events.
 * @param event - Next committed Session event.
 * @returns Updated state, or the same reference for unrelated or malformed input.
 */
export function applyScheduleProjection(
  state: ScheduleProjectionState,
  event: SessionEvent,
): ScheduleProjectionState {
  if (event.type !== 'schedule/change') return state
  try {
    return applyChange(state, decodeScheduleChange(event.data))
  } catch (error: unknown) {
    if (error instanceof ScheduleLogError) return state
    throw error
  }
}

const shared = {
  id: z.string().min(1),
  prompt: z.string().min(1),
  scheduledAt: z.string(),
  paused: z.boolean(),
} as const

const projectionSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ ...shared, kind: z.literal('after'), afterSeconds: z.number().int().positive() }).strict(),
  z.object({ ...shared, kind: z.literal('at') }).strict(),
  z.object({ ...shared, kind: z.literal('every'), everySeconds: z.number().int().positive() }).strict(),
])) as unknown as ZodType<ScheduleProjection>

/** Schedule's fork-aware Session projection definition. */
export const scheduleProjectionDefinition: ProjectionDefinition<'schedules', ScheduleProjectionState> = {
  key: 'schedules',
  schema: projectionSchema,
  init: emptyScheduleProjectionState,
  apply: applyScheduleProjection,
  view: state => Object.freeze(state.schedules.map(({ record, paused }): ScheduleProjectionItem =>
    Object.freeze({ ...record, paused }))) as ScheduleProjection,
  eventScope: 'owned-suffix',
  stateVersion: 1,
}
