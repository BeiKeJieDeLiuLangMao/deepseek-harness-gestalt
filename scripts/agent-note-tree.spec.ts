import { describe, expect, it } from 'vitest'
import {
  AGENT_NOTE_CLASS_VS_AREA,
  inspectActiveAgentNotePath,
} from './agent-note-tree.ts'

describe('inspectActiveAgentNotePath', () => {
  it('accepts a closed class folder', () => {
    expect(inspectActiveAgentNotePath('implemented/process/2026-06-20-agent-note-classification.md')).toEqual({
      note: {
        lifecycle: 'implemented',
        rel: 'implemented/process/2026-06-20-agent-note-classification.md',
        date: '2026-06-20',
      },
    })
  })

  it('rejects a GitHub area folder as a class', () => {
    const result = inspectActiveAgentNotePath('implemented/platform/2026-09-11-example.md')
    expect(result.note).toBeUndefined()
    expect(result.error).toContain('unknown class folder "platform"')
    expect(result.error).toContain(AGENT_NOTE_CLASS_VS_AREA)
  })

  it('rejects a Chinese counterpart under a non-class folder', () => {
    const result = inspectActiveAgentNotePath('implemented/platform/2026-09-11-example.zh.md')
    expect(result.error).toContain(AGENT_NOTE_CLASS_VS_AREA)
  })

  it('rejects extra nesting under a non-class folder', () => {
    const result = inspectActiveAgentNotePath('implemented/platform/infra/2026-09-11-example.md')
    expect(result.error).toContain('unknown class folder "platform"')
    expect(result.error).toContain(AGENT_NOTE_CLASS_VS_AREA)
  })
})
