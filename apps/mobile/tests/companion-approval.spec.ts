import { describe, expect, it } from 'vitest'
import { settleCompanionInteraction, type CompanionInteraction } from '../src/companion-approval.ts'

const approval: CompanionInteraction = {
  operationId: 'op-approve',
  kind: 'approval',
  summary: 'write a.ts',
  cwd: '/repo',
  diff: '+line',
  terminal: 'npm test',
  authorized: ['once', 'session'],
}

const question: CompanionInteraction = {
  operationId: 'op-ask',
  kind: 'ask-user',
  summary: 'Which option?',
  authorized: ['A', 'B'],
}

describe('Mobile Companion approvals and Ask User', () => {
  it('accepts, rejects, and persists only after Desktop acceptance', () => {
    expect(settleCompanionInteraction(approval, { accepted: false, decision: 'once' }).settled).toBeUndefined()
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'once' }).settled)
      .toEqual({ decision: 'once' })
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'session', persistent: true }).settled)
      .toEqual({ decision: 'session', persistent: true })
  })

  it('answers Ask User and refuses to overwrite a settled or stale interaction', () => {
    const answered = settleCompanionInteraction(question, { accepted: true, decision: 'A' })
    expect(answered.settled).toEqual({ decision: 'A' })
    expect(settleCompanionInteraction(answered, { accepted: true, decision: 'B' }).settled).toEqual({ decision: 'A' })
    expect(settleCompanionInteraction(question, { accepted: true, decision: 'A', stale: true }).settled).toBeUndefined()
  })
})
