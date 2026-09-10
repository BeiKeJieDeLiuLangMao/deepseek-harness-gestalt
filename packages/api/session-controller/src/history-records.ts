/** Node-safe expansion of packed Session history transport records. */

import { decodeStorageRecord, type ChunkRow } from '@deepseek-ai/dsh-session/chunk-rows'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { ChunkRowEvent, SessionHistoryRecord, SessionWireEvent } from './types.ts'

/**
 * Expand one history transport record into the logical Session events it stores.
 * Packed `chunkrow/*` rows go through {@link decodeStorageRecord}; scalar events stay verbatim.
 * @param record - validated follow/page record.
 * @returns logical events in log order, including reconstructed `assistant/chunk` members.
 */
export function expandSessionHistoryRecord(record: SessionHistoryRecord): SessionWireEvent[] {
  if (record.type === 'event') return [record.event]
  return decodeStorageRecord(chunkRowFromWire(record.event)) as unknown as SessionWireEvent[]
}

/**
 * Expand a complete history page or follow snapshot without changing its pagination cut.
 * @param records - Host `records` array from `session/page` or `session/follow` snapshot.
 * @returns logical events in log order.
 */
export function expandSessionHistoryRecords(
  records: readonly SessionHistoryRecord[],
): SessionWireEvent[] {
  return records.flatMap(expandSessionHistoryRecord)
}

function chunkRowFromWire(event: ChunkRowEvent): ChunkRow {
  switch (event.type) {
    case 'chunkrow/text-chunks':
      return { type: 'text-chunks', seq0: SessionSeq(event.seq), time0: event.time, data: event.data }
    case 'chunkrow/reasoning-chunks':
      return { type: 'reasoning-chunks', seq0: SessionSeq(event.seq), time0: event.time, data: event.data }
    case 'chunkrow/tool-call-chunks':
      return { type: 'tool-call-chunks', seq0: SessionSeq(event.seq), time0: event.time, data: event.data }
  }
}
