/** Packed history records expand through the Host storage decoder. */

import { describe, expect, it } from 'vitest'
import type { SessionHistoryRecord } from '../src/types.ts'
import { expandSessionHistoryRecords } from '../src/history-records.ts'

describe('Session history record storage decoding', () => {
  it('expands packed chunkrow records without dropping seq or time', () => {
    const packed: SessionHistoryRecord = {
      type: 'chunks',
      event: {
        type: 'chunkrow/text-chunks',
        seq: 11,
        time: 20,
        data: { turn: 1, step: 2, index: 0, dt: [1, 2], texts: ['a', 'b', 'c'] },
      },
    }
    const events = expandSessionHistoryRecords([packed])
    expect(events).toEqual([
      { type: 'assistant/chunk', seq: 11, time: 20, data: { turn: 1, step: 2, chunk: { type: 'text-delta', index: 0, text: 'a' } } },
      { type: 'assistant/chunk', seq: 12, time: 21, data: { turn: 1, step: 2, chunk: { type: 'text-delta', index: 0, text: 'b' } } },
      { type: 'assistant/chunk', seq: 13, time: 23, data: { turn: 1, step: 2, chunk: { type: 'text-delta', index: 0, text: 'c' } } },
    ])
  })
})
