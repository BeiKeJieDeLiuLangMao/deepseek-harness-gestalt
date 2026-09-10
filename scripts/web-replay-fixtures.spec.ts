import { describe, expect, it } from 'vitest'
import { loadSessionScripts } from '@deepseek-ai/dsh-llm-replay'
import {
  sideChatRoundReplayConfig,
  sideChatRoundReplayExpectation,
} from '../apps/web/tests/sidechat-round.fixture.ts'

describe('Web replay fixtures', () => {
  it('keeps the Side Chat call inventory and browser-visible replies canonical', () => {
    const scripts = loadSessionScripts(sideChatRoundReplayConfig)
    expect(scripts).toHaveLength(sideChatRoundReplayExpectation.length)
    for (const [scriptIndex, expectedScript] of sideChatRoundReplayExpectation.entries()) {
      const script = scripts[scriptIndex]
      if (script === undefined) throw new Error(`missing Side Chat replay script ${scriptIndex + 1}`)
      expect(script.entries).toHaveLength(expectedScript.calls.length)
      for (const [callIndex, expectedCall] of expectedScript.calls.entries()) {
        const entry = script.entries[callIndex]
        if (entry === undefined) throw new Error(`missing Side Chat replay call ${scriptIndex + 1}.${callIndex + 1}`)
        if (entry.kind === 'hang') throw new Error(`Side Chat replay call ${scriptIndex + 1}.${callIndex + 1} must complete`)
        const visibleAssistantText = entry.chunks
          .flatMap(chunk => chunk.type === 'text-delta' ? [chunk.text] : [])
          .join('')
        expect(visibleAssistantText).toBe(expectedCall.visibleAssistantText)
      }
    }
  })
})
