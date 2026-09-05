/**
 * Strict Session projection of the Schedule domain's retained reminder set.
 * @module @deepseek-ai/dsh-schedule/projection
 */

import { z } from 'zod'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionLogOffset as SessionLogOffsetType } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { applyScheduleChanges, decodeScheduleChange } from './domain.ts'
import type { FoldedSchedules } from './domain.ts'
import type { ScheduleChange, ScheduleId, ScheduleProjectionItem, ScheduleRecord } from './types.ts'

/** Persisted projection state: the immutable inherited cut plus the complete Schedule fold. */
export interface ScheduleProjectionState extends FoldedSchedules {
  readonly inheritedEventCount: SessionLogOffsetType
}

const scheduleId = z.unknown().transform((value, context): ScheduleId => {
  try {
    const change = decodeScheduleChange({ version: 1, operation: 'delete', id: value }) as Extract<
      ScheduleChange,
      { operation: 'delete' }
    >
    return change.id
  } catch {
    context.addIssue({ code: 'custom', message: 'invalid Schedule id' })
    return z.NEVER
  }
})

const scheduleRecord = z.unknown().transform((value, context): ScheduleRecord => {
  try {
    const change = decodeScheduleChange({ version: 1, operation: 'create', schedule: value }) as Extract<
      ScheduleChange,
      { operation: 'create' }
    >
    return change.schedule
  } catch {
    context.addIssue({ code: 'custom', message: 'invalid Schedule record' })
    return z.NEVER
  }
})

const scheduleRecords = z.array(scheduleRecord) as unknown as z.ZodType<readonly ScheduleRecord[]>

const foldedSchedule = z.object({
  record: scheduleRecord,
  paused: z.boolean(),
}).strict()

const foldedSchedules = z.array(foldedSchedule) as unknown as z.ZodType<FoldedSchedules['schedules']>

const projectionItem = z.unknown().transform((value, context): ScheduleProjectionItem => {
  if (typeof value !== 'object' || value === null || !('paused' in value)) {
    context.addIssue({ code: 'custom', message: 'invalid Schedule projection item' })
    return z.NEVER
  }
  const { paused, ...record } = value as { paused: unknown } & ScheduleRecord
  if (typeof paused !== 'boolean') {
    context.addIssue({ code: 'custom', message: 'invalid Schedule paused flag' })
    return z.NEVER
  }
  try {
    const change = decodeScheduleChange({ version: 1, operation: 'create', schedule: record }) as Extract<
      ScheduleChange,
      { operation: 'create' }
    >
    return { ...change.schedule, paused }
  } catch {
    context.addIssue({ code: 'custom', message: 'invalid Schedule record' })
    return z.NEVER
  }
})

const projectionItems = z.array(projectionItem) as unknown as z.ZodType<readonly ScheduleProjectionItem[]>

const scheduleProjectionStateSchema = z.object({
  inheritedEventCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(SessionLogOffset),
  active: scheduleRecords,
  paused: scheduleRecords,
  schedules: foldedSchedules,
  seenIds: z.array(scheduleId),
}).strict().superRefine((state, context) => {
  const seen = new Set(state.seenIds)
  if (seen.size !== state.seenIds.length) {
    context.addIssue({ code: 'custom', message: 'seen Schedule ids must be unique' })
  }
  const retained = new Set<ScheduleId>()
  const derivedActive: ScheduleRecord[] = []
  const derivedPaused: ScheduleRecord[] = []
  for (const schedule of state.schedules) {
    if (!seen.has(schedule.record.id)) {
      context.addIssue({ code: 'custom', message: 'every retained Schedule id must have been seen' })
    }
    if (retained.has(schedule.record.id)) {
      context.addIssue({ code: 'custom', message: 'retained Schedule ids must be unique' })
    }
    retained.add(schedule.record.id)
    if (schedule.paused) derivedPaused.push(schedule.record)
    else derivedActive.push(schedule.record)
  }
  if (!sameRecords(state.active, derivedActive)) {
    context.addIssue({ code: 'custom', message: 'active Schedule records must match unpaused retained records' })
  }
  if (!sameRecords(state.paused, derivedPaused)) {
    context.addIssue({ code: 'custom', message: 'paused Schedule records must match paused retained records' })
  }
}) as unknown as z.ZodType<ScheduleProjectionState>

/** Compare decoded reminder arrays by order and complete durable fields. */
function sameRecords(left: readonly ScheduleRecord[], right: readonly ScheduleRecord[]): boolean {
  return left.length === right.length
    && left.every((record, index) => JSON.stringify(record) === JSON.stringify(right[index]))
}

/** Projection definition sharing the Schedule domain's strict transition authority. */
export const scheduleProjectionDefinition = {
  key: 'schedule',
  stateSchema: scheduleProjectionStateSchema,
  init: (_header, inheritedEventCount) => ({
    inheritedEventCount,
    active: [],
    paused: [],
    schedules: [],
    seenIds: [],
  }),
  apply: (state, event) => {
    if (event.seq < state.inheritedEventCount || event.type !== 'schedule/change') return state
    return {
      inheritedEventCount: state.inheritedEventCount,
      ...applyScheduleChanges(state, [decodeScheduleChange(event.data)]),
    }
  },
  wire: {
    viewSchema: projectionItems,
    view: state => state.schedules.map(({ record, paused }) => ({ ...record, paused })),
  },
  stateVersion: 3,
} satisfies ProjectionDefinition<'schedule', ScheduleProjectionState>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    schedule: ScheduleProjectionState
  }
}
