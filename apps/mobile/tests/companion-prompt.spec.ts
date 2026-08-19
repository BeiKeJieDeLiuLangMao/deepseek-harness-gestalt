import { describe, expect, it } from 'vitest'
import {
  cancelCompanionPrompt,
  settleCompanionPrompt,
  submitCompanionPrompt,
  type CompanionMutationRecord,
  type CompanionPromptState,
} from '../src/companion-prompt.ts'

const empty: CompanionPromptState = { lines: [], streaming: false, records: [] }

function commit(state: CompanionPromptState): Map<string, CompanionMutationRecord> {
  return new Map(state.records.map(record => [record.operationId, record]))
}

describe('Mobile Companion continue and cancel', () => {
  it('rejects a prompt until Desktop accepts, then streams live assistant updates', () => {
    const rejected = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-1', devicePrincipalId: 'device-1', text: 'hello', accepted: false,
    })
    expect(rejected.lines).toEqual([])
    expect(rejected.records[0]).toMatchObject({ accepted: false, result: 'rejected' })
    const streaming = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-2', devicePrincipalId: 'device-1', text: 'hello', accepted: true,
    })
    expect(streaming.streaming).toBe(true)
    expect(streaming.lines).toEqual(['hello', 'assistant: streaming'])
    expect(settleCompanionPrompt(streaming, 'completed').lines.at(-1)).toBe('assistant: completed')
    expect(settleCompanionPrompt(streaming, 'failed').records.at(-1)?.result).toBe('failed')
  })

  it('cancels through Desktop authority and replays a committed operation id', () => {
    const streaming = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-prompt', devicePrincipalId: 'device-1', text: 'run', accepted: true,
    })
    const cancelled = cancelCompanionPrompt(streaming, commit(streaming), {
      operationId: 'op-cancel', devicePrincipalId: 'device-1', accepted: true,
    })
    expect(cancelled.streaming).toBe(false)
    expect(cancelled.lines.at(-1)).toBe('assistant: cancelled')
    const replay = cancelCompanionPrompt(cancelled, commit(cancelled), {
      operationId: 'op-cancel', devicePrincipalId: 'device-1', accepted: true,
    })
    expect(replay).toEqual(cancelled)
  })
})
