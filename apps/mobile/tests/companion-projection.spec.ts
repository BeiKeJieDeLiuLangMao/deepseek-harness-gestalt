import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  adaptMobileCompanionProjection,
  assertCompanionJsonProjection,
  parseMobileConversationProjection,
  type MobileCompanionProjectionDto,
  type MobilePendingSettlement,
} from '../src/companion-projection.ts'

describe('Mobile Companion JSON projection', () => {
  it('adapts Workspace, Session, conversation nodes, and interaction DTOs without Client Runtime', async () => {
    const dto = projection()
    assertCompanionJsonProjection(JSON.parse(JSON.stringify(dto)))
    const settle = vi.fn(async (settlement: MobilePendingSettlement) => {
      if (settlement.kind === 'question') return { accepted: false, reason: 'not-pending' } as const
      return { accepted: true } as const
    })
    const adapted = adaptMobileCompanionProjection(dto, settle)
    const sessionId = SessionId('session-one')
    expect(adapted.sessions.ids).toEqual([sessionId])
    expect(adapted.sessions.byId[sessionId]?.displayTitle).toBe('One')
    expect(adapted.workspaces).toEqual([{
      workspaceId: 'work-one', path: '/work', title: 'Work',
      sessionIds: [sessionId], createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    }])
    const conversation = adapted.conversations[sessionId]
    expect(conversation?.nodes).toEqual([
      { kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: 'hello' }], source: {} },
    ])
    const approval = conversation?.pending[0]
    const question = conversation?.pending[1]
    if (approval === undefined || question === undefined || approval.kind !== 'approval'
      || question.kind === 'approval') {
      throw new Error('expected adapted pending interactions')
    }
    expect(approval.draft).toEqual({})
    expect(question.draft).toEqual({})
    expect(question.questions).toEqual([{ id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }] }])
    await expect(approval.answer('allowed-once')).resolves.toBeUndefined()
    await expect(question.answer({ answers: [{ id: 'q1', selected: ['Yes'] }] })).resolves.toBeUndefined()
    expect(adapted.conversations[sessionId]?.pending).toHaveLength(2)
    const cleared = projection()
    const conversationDto = cleared.conversations[0]
    if (conversationDto === undefined) throw new Error('expected conversation DTO')
    conversationDto.pending = []
    const next = adaptMobileCompanionProjection(cleared, settle)
    expect(next.conversations[sessionId]?.pending).toEqual([])
    expect(settle).toHaveBeenNthCalledWith(1, {
      kind: 'approval', sessionId, interactionId: 'approval-rpc',
      result: { ok: true, value: { outcome: 'allowed-once' } },
    })
    expect(settle).toHaveBeenNthCalledWith(2, {
      kind: 'question', sessionId, interactionId: 'question-rpc',
      result: { ok: true, value: { answer: { answers: [{ id: 'q1', selected: ['Yes'] }] } } },
    })
  })

  it('keeps Ask User and Approval drafts when Desktop settlement fails', async () => {
    const settle = vi.fn(async () => {
      throw new Error('Companion encrypted operation could not be sent')
    })
    const adapted = adaptMobileCompanionProjection(projection(), settle)
    const conversation = adapted.conversations[SessionId('session-one')]
    const approval = conversation?.pending[0]
    const question = conversation?.pending[1]
    if (approval === undefined || question === undefined || approval.kind !== 'approval'
      || question.kind !== 'question') {
      throw new Error('expected adapted pending interactions')
    }
    await expect(approval.answer('rejected')).rejects.toThrow('could not be sent')
    expect(approval.draft).toEqual({ outcome: 'rejected' })
    await expect(question.answer({ answers: [{ id: 'q1', selected: ['Yes'] }] }))
      .rejects.toThrow('could not be sent')
    expect(question.draft).toEqual({ answers: [{ id: 'q1', selected: ['Yes'] }] })
    await expect(question.cancel()).rejects.toThrow('could not be sent')
    expect(question.draft).toEqual({ answers: [{ id: 'q1', selected: ['Yes'] }] })
  })

  it('rejects class-backed values and malformed conversation nodes', () => {
    expect(() => assertCompanionJsonProjection({ ...projection(), conversations: new Map() }))
      .toThrow('must contain only JSON-compatible values')
    expect(() => parseMobileConversationProjection({
      ...projection().conversations[0],
      nodes: [{ kind: 'user', seq: -1, time: 1, content: [], source: {} }],
    })).toThrow('Authenticated Companion conversation projection is invalid')
  })
})

function projection(): MobileCompanionProjectionDto {
  return {
    type: 'desktop-resync',
    version: 1,
    authenticated: true,
    desktopName: 'One Desktop',
    sessions: {
      ids: ['session-one'],
      byId: {
        'session-one': {
          id: 'session-one', title: 'One', displayTitle: 'One', running: true, blank: false, updatedAt: 1,
        },
      },
      current: null,
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: null,
    },
    workspaces: [{
      workspaceId: 'work-one', path: '/work', title: 'Work', sessionIds: ['session-one'],
      createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
    }],
    conversations: [{
      sessionId: 'session-one',
      nodes: [{ kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: 'hello' }], source: {} }],
      turnTimings: [],
      turnEnds: [],
      partial: null,
      runningCalls: [],
      pending: [{
        kind: 'approval', interactionId: 'approval-rpc', sessionId: 'session-one',
        payload: { approvalId: 'approval-id', toolName: 'write', reason: 'Allow write' },
      }, {
        kind: 'question', interactionId: 'question-rpc', sessionId: 'session-one',
        payload: { questions: [{ id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }] }] },
      }],
      queue: [],
      running: true,
      subagent: null,
      composerPhase: 'active',
      removed: false,
      openState: 'open',
      openError: null,
      hasMore: false,
      loadingOlder: false,
      promptError: null,
      blank: false,
      lastAgentError: null,
    }],
  }
}
