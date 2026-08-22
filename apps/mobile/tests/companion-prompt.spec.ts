import { describe, expect, it } from 'vitest'
import {
  cancelCompanionPrompt,
  settleCompanionPrompt,
  submitCompanionPrompt,
  type CompanionMutationRecord,
  type CompanionPromptState,
} from '../src/companion-prompt.ts'

const empty: CompanionPromptState = { lines: [], streaming: false, records: [] }
const ready = { foreground: true, socketOpen: true, synchronized: true }
const reconnecting = { foreground: true, socketOpen: true, synchronized: false }

function commit(state: CompanionPromptState): Map<string, CompanionMutationRecord> {
  return new Map(state.records.map(record => [record.operationId, record]))
}

describe('Mobile Companion continue and cancel', () => {
  it('rejects a prompt until Desktop accepts, then streams live assistant updates', () => {
    const rejected = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-1', devicePrincipalId: 'device-1', text: 'hello', accepted: false,
    }, ready)
    expect(rejected.lines).toEqual([])
    expect(rejected.records[0]).toMatchObject({ accepted: false, result: 'rejected' })
    const streaming = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-2', devicePrincipalId: 'device-1', text: 'hello', accepted: true,
    }, ready)
    expect(streaming.streaming).toBe(true)
    expect(streaming.lines).toEqual(['hello', 'assistant: streaming'])
    expect(settleCompanionPrompt(streaming, 'completed').lines.at(-1)).toBe('assistant: completed')
    expect(settleCompanionPrompt(streaming, 'failed').records.at(-1)?.result).toBe('failed')
  })

  it('cancels through Desktop authority and replays a committed operation id', () => {
    const streaming = submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-prompt', devicePrincipalId: 'device-1', text: 'run', accepted: true,
    }, ready)
    const cancelled = cancelCompanionPrompt(streaming, commit(streaming), {
      operationId: 'op-cancel', devicePrincipalId: 'device-1', accepted: true,
    }, ready)
    expect(cancelled.streaming).toBe(false)
    expect(cancelled.lines.at(-1)).toBe('assistant: cancelled')
    const replay = cancelCompanionPrompt(cancelled, commit(cancelled), {
      operationId: 'op-cancel', devicePrincipalId: 'device-1', accepted: true,
    }, ready)
    expect(replay).toEqual(cancelled)
  })

  it('refuses prompt and cancellation mutations before foreground synchronization', () => {
    expect(() => submitCompanionPrompt(empty, new Map(), {
      operationId: 'op-blocked-prompt', devicePrincipalId: 'device-1', text: 'run', accepted: true,
    }, reconnecting)).toThrow(/foreground synchronization/)
    expect(() => cancelCompanionPrompt({ ...empty, streaming: true }, new Map(), {
      operationId: 'op-blocked-cancel', devicePrincipalId: 'device-1', accepted: true,
    }, reconnecting)).toThrow(/foreground synchronization/)
  })
})
