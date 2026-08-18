import { describe, expect, it } from 'vitest'
import {
  clearCompanionPushToken,
  companionPushHint,
  openCompanionDeepLink,
  setCompanionForeground,
} from '../src/companion-push.ts'

const ready = { token: 'tok', foreground: true, socketOpen: true, synchronized: true }

describe('content-free Companion push', () => {
  it('emits generic hints for approvals, questions, completion, and failure, but not streaming', () => {
    expect(companionPushHint({ kind: 'approval', route: 'op-1' })).toEqual({ category: 'approval', route: 'op-1' })
    expect(companionPushHint({ kind: 'question', route: 'op-2' })?.category).toBe('question')
    expect(companionPushHint({ kind: 'turn-complete', route: 'op-3' })?.category).toBe('turn-complete')
    expect(companionPushHint({ kind: 'failure', route: 'op-4' })?.category).toBe('failure')
    expect(companionPushHint({ kind: 'streaming', route: 'op-5' })).toBeUndefined()
  })

  it('foregrounds and syncs before enabling an action, and pauses WSS in background', () => {
    expect(openCompanionDeepLink({ ...ready, synchronized: false }, { category: 'approval', route: 'op-1' }))
      .toEqual({ action: 'sync-first', route: 'op-1' })
    expect(openCompanionDeepLink(ready, { category: 'approval', route: 'op-1' }))
      .toEqual({ action: 'open', route: 'op-1' })
    const background = setCompanionForeground(ready, false)
    expect(background.socketOpen).toBe(false)
    expect(setCompanionForeground(background, true).socketOpen).toBe(true)
    expect(clearCompanionPushToken(ready).token).toBeUndefined()
  })
})
