import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  applyScheduleProjection,
  emptyScheduleProjectionState,
  scheduleProjectionDefinition,
} from '../src/projection.ts'

function change(data: unknown, seq: number): SessionEvent {
  return { type: 'schedule/change', seq, time: seq, data } as SessionEvent
}

const create = {
  version: 1,
  operation: 'create',
  schedule: {
    id: 'schedule-1',
    kind: 'after',
    prompt: 'check logs',
    afterSeconds: 30,
    scheduledAt: '2026-08-18T01:00:00.000Z',
  },
} as const

describe('Schedule session projection', () => {
  it('projects durable pause, resume, and delete changes as whole retained records', () => {
    const created = applyScheduleProjection(emptyScheduleProjectionState(), change(create, 0))
    const paused = applyScheduleProjection(created, change({ version: 1, operation: 'pause', id: 'schedule-1' }, 1))
    expect(scheduleProjectionDefinition.view(paused)).toEqual([{
      ...create.schedule,
      paused: true,
    }])

    const resumed = applyScheduleProjection(paused, change({ version: 1, operation: 'resume', id: 'schedule-1' }, 2))
    expect(scheduleProjectionDefinition.view(resumed)).toEqual([{
      ...create.schedule,
      paused: false,
    }])
    const deleted = applyScheduleProjection(resumed, change({ version: 1, operation: 'delete', id: 'schedule-1' }, 3))
    expect(scheduleProjectionDefinition.view(deleted)).toEqual([])
  })

  it('ignores unrelated and malformed transitions without publishing a new reference', () => {
    const empty = emptyScheduleProjectionState()
    expect(applyScheduleProjection(empty, { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } }))
      .toBe(empty)
    expect(applyScheduleProjection(empty, change({ version: 1, operation: 'pause', id: 'missing' }, 1)))
      .toBe(empty)
  })

  it('declares fork-owned event scope for standard Session projection transport', () => {
    expect(scheduleProjectionDefinition).toMatchObject({
      key: 'schedules',
      eventScope: 'owned-suffix',
    })
  })
})
