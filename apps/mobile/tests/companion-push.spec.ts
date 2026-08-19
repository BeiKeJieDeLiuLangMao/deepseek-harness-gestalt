import { describe, expect, it } from 'vitest'
import { parseCompanionPushHint, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import { settleCompanionInteraction, type CompanionInteraction } from '../src/companion-approval.ts'
import {
  companionMayMutate,
  CompanionForegroundRuntime,
  markCompanionSocketOpen,
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
const hint = parseCompanionPushHint({ category: 'approval', routeId: parseRelayRouteId('op-1') })

describe('content-free Companion push', () => {
  it('foregrounds, reconnects, and synchronizes before presenting, and never settles from notification chrome', () => {
    const background = setCompanionForeground(ready, false)
    expect(background).toEqual({
      token: 'tok', foreground: false, socketOpen: false, synchronized: false,
    })
    expect(companionMayMutate(background)).toBe(false)
    expect(openCompanionDeepLink(background, hint, 'approve'))
      .toEqual({ phase: 'foreground', settle: false, routeId: 'op-1', chrome: 'approve' })

    const reconnecting = setCompanionForeground(background, true)
    expect(reconnecting.socketOpen).toBe(false)
    expect(reconnecting.synchronized).toBe(false)
    expect(companionMayMutate(reconnecting)).toBe(false)
    expect(openCompanionDeepLink(reconnecting, hint, 'answer'))
      .toEqual({ phase: 'reconnect', settle: false, routeId: 'op-1', chrome: 'answer' })

    const attached = markCompanionSocketOpen(reconnecting)
    expect(openCompanionDeepLink(attached, hint))
      .toEqual({ phase: 'synchronize', settle: false, routeId: 'op-1', chrome: 'open' })

    const synchronized = markCompanionSynchronized(attached)
    expect(companionMayMutate(synchronized)).toBe(true)
    expect(openCompanionDeepLink(synchronized, hint, 'approve'))
      .toEqual({ phase: 'present', settle: false, routeId: 'op-1', chrome: 'approve' })
    expect(markCompanionSynchronized(background).synchronized).toBe(false)
    expect(openCompanionDeepLink(synchronized, hint, 'approve').settle).toBe(false)
  })

  it('refuses settlement while unsynchronized, including calls that bypass the deep-link helper', () => {
    const background = setCompanionForeground(ready, false)
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'once' }, background).settled)
      .toBeUndefined()
    const reconnecting = setCompanionForeground(background, true)
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'once' }, reconnecting).settled)
      .toBeUndefined()
    const attached = markCompanionSocketOpen(reconnecting)
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'once' }, attached).settled)
      .toBeUndefined()
    expect(settleCompanionInteraction(approval, { accepted: true, decision: 'once' }, ready).settled)
      .toEqual({ decision: 'once' })
  })

  it('stops the real Relay lifecycle on background and opens a socket only after isConnected', async () => {
    const relay = {
      start: async () => {},
      stop: async () => {},
      isConnected: () => false,
    }
    const started: string[] = []
    relay.start = async () => { started.push('start') }
    relay.stop = async () => { started.push('stop') }
    const runtime = new CompanionForegroundRuntime({ relay })
    await runtime.setForeground(false)
    expect(started).toEqual(['stop'])
    expect(companionMayMutate(runtime.getState())).toBe(false)
    await runtime.setForeground(true)
    expect(started).toEqual(['stop', 'start'])
    expect(runtime.getState().socketOpen).toBe(false)
    relay.isConnected = () => true
    await runtime.setForeground(true)
    expect(runtime.getState().socketOpen).toBe(true)
    expect(runtime.getState().synchronized).toBe(false)
    expect(companionMayMutate(runtime.getState())).toBe(false)
  })
})
