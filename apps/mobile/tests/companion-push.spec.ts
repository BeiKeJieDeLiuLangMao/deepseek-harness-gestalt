import { describe, expect, it } from 'vitest'
import { settleCompanionInteraction, type CompanionInteraction } from '../src/companion-approval.ts'
import {
  clearCompanionPushToken,
  companionMayMutate,
  companionPushHint,
  markCompanionSynchronized,
  openCompanionDeepLink,
  setCompanionForeground,
} from '../src/companion-push.ts'

const ready = { token: 'tok', foreground: true, socketOpen: true, synchronized: true }
const approval: CompanionInteraction = {
  operationId: 'op-approve',
  kind: 'approval',
  summary: 'write a.ts',
  authorized: ['once'],
}

describe('content-free Companion push', () => {
  it('emits generic hints for approvals, questions, completion, and failure, but not streaming', () => {
    expect(companionPushHint({ kind: 'approval', route: 'op-1', sessionRef: 'session-one' }))
      .toEqual({ category: 'approval', routeId: 'op-1', sessionRef: 'session-one' })
    expect(companionPushHint({ kind: 'question', route: 'op-2' })?.category).toBe('question')
    expect(companionPushHint({ kind: 'turn-complete', route: 'op-3' })?.category).toBe('turn-complete')
    expect(companionPushHint({ kind: 'failure', route: 'op-4' })?.category).toBe('failure')
    expect(companionPushHint({ kind: 'streaming', route: 'op-5' })).toBeUndefined()
  })

  it('foregrounds, reconnects, and synchronizes before presenting, and never settles from notification chrome', () => {
    const hint = companionPushHint({ kind: 'approval', route: 'op-1' })
    if (hint === undefined) throw new Error('expected approval hint')
    const background = setCompanionForeground(ready, false)
    expect(background).toEqual({
      token: 'tok', foreground: false, socketOpen: false, synchronized: false,
    })
    expect(companionMayMutate(background)).toBe(false)
    expect(openCompanionDeepLink(background, hint, 'approve'))
      .toEqual({ phase: 'foreground', settle: false, routeId: 'op-1', chrome: 'approve' })

    const reconnecting = setCompanionForeground(background, true)
    expect(reconnecting.socketOpen).toBe(true)
    expect(reconnecting.synchronized).toBe(false)
    expect(companionMayMutate(reconnecting)).toBe(false)
    expect(openCompanionDeepLink({ ...reconnecting, socketOpen: false }, hint, 'answer'))
      .toEqual({ phase: 'reconnect', settle: false, routeId: 'op-1', chrome: 'answer' })
    expect(openCompanionDeepLink(reconnecting, hint))
      .toEqual({ phase: 'synchronize', settle: false, routeId: 'op-1', chrome: 'open' })

    const synchronized = markCompanionSynchronized(reconnecting)
    expect(companionMayMutate(synchronized)).toBe(true)
    expect(openCompanionDeepLink(synchronized, hint, 'approve'))
      .toEqual({ phase: 'present', settle: false, routeId: 'op-1', chrome: 'approve' })
    expect(markCompanionSynchronized(background).synchronized).toBe(false)
    expect(settleCompanionInteraction(approval, {
      accepted: openCompanionDeepLink(synchronized, hint, 'approve').settle,
      decision: 'once',
    }).settled).toBeUndefined()
    expect(clearCompanionPushToken(ready).token).toBeUndefined()
  })
})
