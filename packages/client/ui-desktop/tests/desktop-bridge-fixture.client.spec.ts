import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { DesktopBridge } from '../src/protocol.ts'
import { INITIAL_ACCOUNT_SNAPSHOT } from '../src/client/account-source.ts'
import { INITIAL_PAIRING_SNAPSHOT } from '../src/client/pairing-source.ts'
import { INITIAL_SUB2API_SNAPSHOT } from '../src/client/sub2api-source.ts'
import { installDesktopBridgeFixture } from './desktop-bridge-fixture.client.ts'

describe('DesktopBridge Web E2E fixture', () => {
  afterEach(() => {
    delete (globalThis as { dshDesktop?: DesktopBridge }).dshDesktop
  })

  it('is type-checked against the current preload interface', () => {
    expectTypeOf(installDesktopBridgeFixture).returns.toEqualTypeOf<DesktopBridge>()
  })

  it('publishes overlay requests and replies until unsubscribe', async () => {
    const bridge = installDesktopBridgeFixture('darwin')
    const state = vi.fn()
    const reply = vi.fn()
    const stopState = bridge.onChromeOverlayState(state)
    const stopReply = bridge.onChromeOverlayResult(reply)
    const request = { kind: 'settings', requestId: 'settings' } as const
    await bridge.chromeOverlayShow(request)
    await expect(bridge.chromeOverlayGetState()).resolves.toEqual(request)
    expect(state).toHaveBeenLastCalledWith(request)
    const closed = { type: 'close', requestId: 'settings' } as const
    bridge.chromeOverlayResult(closed)
    await expect(bridge.chromeOverlayGetState()).resolves.toBeNull()
    expect(state).toHaveBeenLastCalledWith(null)
    expect(reply).toHaveBeenCalledExactlyOnceWith(closed)
    stopState()
    stopReply()
    state.mockClear()
    reply.mockClear()
    await bridge.chromeOverlayShow(request)
    await bridge.chromeOverlayHide()
    bridge.chromeOverlayResult(closed)
    expect(state).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it('delivers inert Account, Pairing, and Sub2API snapshots and honors unsubscribe', async () => {
    const bridge = installDesktopBridgeFixture('darwin')
    expect(bridge.platform).toBe('darwin')
    await expect(bridge.getStatus()).resolves.toEqual({ state: 'disabled', lastCheckedAt: null })
    await expect(bridge.accountGetSnapshot()).resolves.toEqual(INITIAL_ACCOUNT_SNAPSHOT)
    await expect(bridge.pairingGetSnapshot()).resolves.toEqual(INITIAL_PAIRING_SNAPSHOT)
    await expect(bridge.sub2ApiGetSnapshot()).resolves.toEqual(INITIAL_SUB2API_SNAPSHOT)

    const onAccount = vi.fn()
    const onPairing = vi.fn()
    const onSub2api = vi.fn()
    const onStatus = vi.fn()
    const stopAccount = bridge.onAccountSnapshot(onAccount)
    const stopPairing = bridge.onPairingSnapshot(onPairing)
    const stopSub2api = bridge.onSub2ApiSnapshot(onSub2api)
    const stopStatus = bridge.onStatus(onStatus)
    expect(onAccount).toHaveBeenCalledExactlyOnceWith(INITIAL_ACCOUNT_SNAPSHOT)
    expect(onPairing).toHaveBeenCalledExactlyOnceWith(INITIAL_PAIRING_SNAPSHOT)
    expect(onSub2api).toHaveBeenCalledExactlyOnceWith(INITIAL_SUB2API_SNAPSHOT)
    expect(onStatus).not.toHaveBeenCalled()

    stopAccount()
    stopPairing()
    stopSub2api()
    stopStatus()
    stopAccount()
    stopPairing()
    stopSub2api()
    stopStatus()

    await bridge.accountAcceptPrivacy()
    await bridge.pairingSetEnabled(true)
    await bridge.sub2ApiEnable()
    bridge.checkNow()
    expect(onAccount).toHaveBeenCalledOnce()
    expect(onPairing).toHaveBeenCalledOnce()
    expect(onSub2api).toHaveBeenCalledOnce()
    expect(onStatus).not.toHaveBeenCalled()
  })
})
