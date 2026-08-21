import { describe, expect, it } from 'vitest'
import {
  hostApprovalOutcome,
  hostSessionSummary,
  hostSessionTitle,
  matchHostSessions,
  projectHostHistory,
  projectHostQuestions,
  sanitizeIdentifier,
} from '../src/companion-host-transcript.ts'

describe('Host Companion transcript projection', () => {
  it('projects user, assistant, tool, and image history without inventing model text', () => {
    expect(projectHostHistory([
      { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'hello from Desktop' }] } } },
      { event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'real Host reply' }] } } } },
      { event: { type: 'tool/call', data: { name: 'bash' } } },
      { event: { type: 'user/message', data: { content: [{ type: 'image', attachment: { name: 'shot.png' } }] } } },
      { event: { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'user' }, content: [{ type: 'text', text: 'inbox user' }] }] } } },
      { event: { type: 'assistant/chunk', data: { text: 'stream' } } },
      { event: { type: 'assistant/chunk', data: { text: 'ing' } } },
      { type: 'turn/end' },
    ])).toEqual([
      expect.objectContaining({ type: 'text', role: 'user', text: 'hello from Desktop' }),
      expect.objectContaining({ type: 'text', role: 'assistant', text: 'real Host reply' }),
      expect.objectContaining({ type: 'text', role: 'assistant', text: 'Tool: bash' }),
      expect.objectContaining({ type: 'image', fileName: 'shot.png' }),
      expect.objectContaining({ type: 'text', role: 'user', text: 'inbox user' }),
      expect.objectContaining({ type: 'text', role: 'assistant', text: 'streaming' }),
    ])
  })

  it('reads Host list titles and maps Mobile approval tokens', () => {
    expect(hostSessionTitle({ projections: { values: { title: 'Docs' } } })).toBe('Docs')
    expect(hostSessionSummary({ projections: { values: { title: 'Docs', preview: 'last line' } } })).toBe('last line')
    expect(hostSessionTitle({})).toBe('Session')
    expect(matchHostSessions([
      { sessionId: 'a', title: 'Alpha', summary: 'hello world', updatedAt: 2 },
      { sessionId: 'b', title: 'Beta', summary: 'other', workspace: 'hello', updatedAt: 1 },
      { sessionId: 'c', title: 'Gamma', summary: 'nope', updatedAt: 3 },
    ], 'hello', new Map([['c', 'user said hello']]), 20).map(row => row.sessionId)).toEqual(['a', 'b', 'c'])
    expect(hostApprovalOutcome('once')).toBe('allowed-once')
    expect(hostApprovalOutcome('always')).toBe('allowed-once')
    expect(hostApprovalOutcome('rejected')).toBe('rejected')
    expect(hostApprovalOutcome('B')).toBeUndefined()
    expect(sanitizeIdentifier('approval/1')).toBe('approval-1')
    expect(projectHostQuestions([{ id: 'q1', question: 'Which path?', options: [{ label: 'A' }] }])).toEqual([
      expect.objectContaining({ type: 'ask-user', summary: 'Which path?', authorized: ['A'] }),
    ])
  })
})
