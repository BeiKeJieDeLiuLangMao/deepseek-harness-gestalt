import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  adaptMobileCompanionProjection,
  assertCompanionJsonProjection,
  parseMobileConversationProjection,
  MobilePendingDraftStore,
  MobilePendingSettlementRejectedError,
  type MobileCompanionProjectionDto,
  type MobilePendingSettlement,
} from '../src/companion-projection.ts'

describe('Mobile Companion JSON projection', () => {
  it('adapts Workspace, Session, conversation nodes, and interaction DTOs without Client Runtime', async () => {
    const dto = projection()
    assertCompanionJsonProjection(JSON.parse(JSON.stringify(dto)))
    const settle = vi.fn(async (_settlement: MobilePendingSettlement) => ({ accepted: true as const }))
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

  it('keeps the same pending object after rejected settlement so retry can resend the draft', async () => {
    const settle = vi.fn(async () => {
      if (settle.mock.calls.length === 1) {
        throw new Error('Companion encrypted operation could not be sent')
      }
      return { accepted: true as const }
    })
    const adapted = adaptMobileCompanionProjection(projection(), settle)
    const approval = adapted.conversations[SessionId('session-one')]?.pending[0]
    if (approval === undefined || approval.kind !== 'approval') {
      throw new Error('expected adapted pending Approval')
    }
    await expect(approval.answer('rejected')).rejects.toThrow('could not be sent')
    expect(approval.draft).toEqual({ outcome: 'rejected' })
    expect(adapted.conversations[SessionId('session-one')]?.pending[0]).toBe(approval)
    await expect(approval.answer('rejected')).resolves.toBeUndefined()
    expect(approval.draft).toEqual({ outcome: 'rejected' })
    expect(settle).toHaveBeenCalledTimes(2)
  })

  it('does not complete a pending row when Desktop returns accepted false', async () => {
    const settle = vi.fn(async () => ({ accepted: false as const, reason: 'not-pending' }))
    const adapted = adaptMobileCompanionProjection(projection(), settle)
    const question = adapted.conversations[SessionId('session-one')]?.pending[1]
    if (question === undefined || question.kind !== 'question') {
      throw new Error('expected adapted pending Ask User')
    }
    const answers = [{ id: 'q1', selected: ['Yes'] }]
    await expect(question.answer({ answers })).rejects.toBeInstanceOf(MobilePendingSettlementRejectedError)
    await expect(question.answer({ answers })).rejects.toThrow('not accepted: not-pending')
    expect(question.draft).toEqual({ answers })
    expect(adapted.conversations[SessionId('session-one')]?.pending).toHaveLength(2)
  })

  it('restores drafts by interaction id across a later Host snapshot of the same pending rows', async () => {
    const drafts = new MobilePendingDraftStore()
    const firstSettle = vi.fn(async () => {
      throw new Error('Companion encrypted operation could not be sent')
    })
    const first = adaptMobileCompanionProjection(projection(), firstSettle, drafts)
    const approval = first.conversations[SessionId('session-one')]?.pending[0]
    const question = first.conversations[SessionId('session-one')]?.pending[1]
    if (approval === undefined || question === undefined || approval.kind !== 'approval'
      || question.kind !== 'question') {
      throw new Error('expected adapted pending interactions')
    }
    await expect(approval.answer('allowed-once')).rejects.toThrow('could not be sent')
    await expect(question.answer({ answers: [{ id: 'q1', selected: ['Yes'] }] }))
      .rejects.toThrow('could not be sent')
    const next = adaptMobileCompanionProjection(projection(), vi.fn(async () => ({ accepted: true as const })), drafts)
    const nextApproval = next.conversations[SessionId('session-one')]?.pending[0]
    const nextQuestion = next.conversations[SessionId('session-one')]?.pending[1]
    expect(nextApproval).not.toBe(approval)
    expect(nextApproval?.kind).toBe('approval')
    expect(nextQuestion?.kind).toBe('question')
    if (nextApproval?.kind !== 'approval' || nextQuestion?.kind !== 'question') {
      throw new Error('expected restored pending interactions')
    }
    expect(nextApproval.draft).toEqual({ outcome: 'allowed-once' })
    expect(nextQuestion.draft).toEqual({ answers: [{ id: 'q1', selected: ['Yes'] }] })
  })

  it('keeps a draft across a later snapshot of the same Session, interaction, and generation', async () => {
    const drafts = new MobilePendingDraftStore()
    const first = adaptMobileCompanionProjection(projection(), vi.fn(async () => {
      throw new Error('Companion encrypted operation could not be sent')
    }), drafts)
    const approval = first.conversations[SessionId('session-one')]?.pending[0]
    if (approval?.kind !== 'approval') throw new Error('expected adapted pending Approval')
    await expect(approval.answer('allowed-once')).rejects.toThrow('could not be sent')
    const refreshed = adaptMobileCompanionProjection(projection(), vi.fn(async () => ({ accepted: true as const })), drafts)
    const next = refreshed.conversations[SessionId('session-one')]?.pending[0]
    if (next?.kind !== 'approval') throw new Error('expected refreshed pending Approval')
    expect(next.draft).toEqual({ outcome: 'allowed-once' })
  })

  it('isolates reused interaction ids across Sessions and Host generations', async () => {
    const drafts = new MobilePendingDraftStore()
    const first = adaptMobileCompanionProjection(projection(), vi.fn(async () => {
      throw new Error('Companion encrypted operation could not be sent')
    }), drafts)
    const approval = first.conversations[SessionId('session-one')]?.pending[0]
    if (approval?.kind !== 'approval') throw new Error('expected adapted pending Approval')
    await expect(approval.answer('allowed-once')).rejects.toThrow('could not be sent')
    const otherSession = projection()
    const otherConversation = otherSession.conversations[0]
    if (otherConversation === undefined) throw new Error('expected conversation DTO')
    otherSession.sessions.ids = ['session-two']
    otherSession.sessions.byId = {
      'session-two': {
        id: 'session-two', title: 'Two', displayTitle: 'Two', running: true, blank: false, updatedAt: 1,
      },
    }
    otherConversation.sessionId = 'session-two'
    otherConversation.pending = [{
      kind: 'approval', interactionId: 'approval-rpc', sessionId: 'session-two',
      payload: { approvalId: 'approval-id', toolName: 'write', reason: 'Allow write' },
    }]
    const isolated = adaptMobileCompanionProjection(otherSession, vi.fn(async () => ({ accepted: true as const })), drafts)
    expect(isolated.conversations[SessionId('session-two')]?.pending[0]?.kind).toBe('approval')
    if (isolated.conversations[SessionId('session-two')]?.pending[0]?.kind !== 'approval') {
      throw new Error('expected isolated pending Approval')
    }
    expect(isolated.conversations[SessionId('session-two')]?.pending[0].draft).toEqual({})
    const replacement = new MobilePendingDraftStore()
    drafts.revoke()
    const nextGeneration = adaptMobileCompanionProjection(projection(), vi.fn(async () => ({ accepted: true as const })), replacement)
    const nextApproval = nextGeneration.conversations[SessionId('session-one')]?.pending[0]
    if (nextApproval?.kind !== 'approval') throw new Error('expected replacement-generation pending Approval')
    expect(nextApproval.draft).toEqual({})
    await expect(approval.answer('rejected')).rejects.toMatchObject({ name: 'MobilePendingDraftStoreRevokedError' })
    expect(nextApproval.draft).toEqual({})
  })

  it('drops drafts when the Host projection no longer lists the pending row', async () => {
    const drafts = new MobilePendingDraftStore()
    const first = adaptMobileCompanionProjection(projection(), vi.fn(async () => {
      throw new Error('Companion encrypted operation could not be sent')
    }), drafts)
    const approval = first.conversations[SessionId('session-one')]?.pending[0]
    if (approval?.kind !== 'approval') throw new Error('expected adapted pending Approval')
    await expect(approval.answer('allowed-once')).rejects.toThrow('could not be sent')
    const terminal = projection()
    const conversationDto = terminal.conversations[0]
    if (conversationDto === undefined) throw new Error('expected conversation DTO')
    conversationDto.pending = []
    const next = adaptMobileCompanionProjection(terminal, vi.fn(async () => ({ accepted: true as const })), drafts)
    expect(next.conversations[SessionId('session-one')]?.pending).toEqual([])
    const revived = adaptMobileCompanionProjection(projection(), vi.fn(async () => ({ accepted: true as const })), drafts)
    const revivedApproval = revived.conversations[SessionId('session-one')]?.pending[0]
    if (revivedApproval?.kind !== 'approval') throw new Error('expected revived pending Approval')
    expect(revivedApproval.draft).toEqual({})
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
