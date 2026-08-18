import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import type {
  DesktopBridge,
  DesktopPairingChallenge,
  DesktopPendingPairing,
  DesktopPersonalPairing,
} from '@deepseek-ai/dsh-client-ui-desktop/protocol'
import { parseAccountProofJti } from '@deepseek-ai/dsh-platform-account'
import {
  parsePairingChallengeId,
  parsePendingPairingId,
  parsePersonalPairingId,
  type PairingChallengeId,
  type PendingPairingId,
  type PersonalPairingId,
} from '@deepseek-ai/dsh-remote-access'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import { FailClosedDesktopRelayLifecycle } from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'
import {
  bindDesktopPairing,
  createDesktopPairingSource,
} from '../../../packages/client/ui-desktop/src/client/pairing-source.ts'
import {
  parseRelayCredential,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  DesktopPairingController,
  UnavailableDesktopPairingController,
  confirmPairingFromIpc,
  parseDesktopPendingPairingId,
  parsePairingEnabled,
  rejectPairingFromIpc,
  setPairingEnabledFromIpc,
} from '../src/personal-pairing.ts'

describe('UnavailableDesktopPairingController', () => {
  it('keeps every product verb fail-closed before independent Noise review', async () => {
    const controller = new UnavailableDesktopPairingController('independent review pending')
    const expected = {
      status: 'unavailable', enabled: false, pairings: [], error: 'independent review pending',
    }
    expect(controller.getSnapshot()).toEqual(expected)
    await expect(controller.setEnabled(true)).rejects.toThrow('independent review pending')
    await expect(controller.createChallenge()).rejects.toThrow('independent review pending')
    await expect(controller.cancelChallenge()).rejects.toThrow('independent review pending')
    await expect(controller.confirm(parsePendingPairingId('pending-1'))).rejects.toThrow('independent review pending')
    await expect(controller.reject(parsePendingPairingId('pending-1'))).rejects.toThrow('independent review pending')
    const listener = vi.fn()
    controller.subscribe(listener)()
    expect(listener).not.toHaveBeenCalled()
    await expect(controller.deactivate()).resolves.toBeUndefined()
    await expect(controller.dispose()).resolves.toBeUndefined()
  })

  it('keeps the product Relay composition observably offline for lifecycle hooks', async () => {
    const relay = new FailClosedDesktopRelayLifecycle('crypto gate pending')
    const controller = new UnavailableDesktopPairingController('crypto gate pending', relay)
    await expect(relay.start()).rejects.toThrow('crypto gate pending')
    expect(relay.getState()).toEqual({ connected: false })

    await controller.deactivate('sleep')
    expect(relay.getState()).toEqual({ connected: false, stopReason: 'sleep' })
    await controller.dispose()
    expect(relay.getState()).toEqual({ connected: false, stopReason: 'quit' })
  })
})

describe('DesktopPairingController', () => {
  it('installs the Settings Relay grant before starting the endpoint lifecycle', async () => {
    const transport = transportFixture()
    const grant = {
      routeId: parseRelayRouteId('route-settings'),
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      revision: 1,
    }
    transport.setMobileAccess.mockResolvedValueOnce({ enabled: true, relay: grant })
    const order: string[] = []
    const relay = {
      configure: vi.fn(async () => { order.push('configure') }),
      start: vi.fn(async () => { order.push('start') }),
      stop: vi.fn(async () => {}),
    }
    const controller = new DesktopPairingController({
      account: {
        getSnapshot: signedInAccountSnapshot,
        authorizeCurrentInstallation: vi.fn(async () => ({
          accessToken: 'desktop-access',
          proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
        })),
      },
      transport,
      relay,
    })
    await controller.start()

    await controller.setEnabled(true)

    expect(relay.configure).toHaveBeenCalledWith(grant)
    expect(order).toEqual(['configure', 'start'])
    await controller.dispose()
  })

  it('owns the live Relay only while Mobile Access is enabled and the Desktop is awake', async () => {
    const transport = transportFixture()
    const relay = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) }
    const controller = new DesktopPairingController({
      account: {
        getSnapshot: signedInAccountSnapshot,
        authorizeCurrentInstallation: vi.fn(async () => ({
          accessToken: 'desktop-access',
          proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
        })),
      },
      transport,
      relay,
    })

    await controller.start()
    expect(relay.stop).toHaveBeenLastCalledWith('mobile-access-disabled')
    await controller.setEnabled(true)
    expect(relay.start).toHaveBeenCalledOnce()

    await controller.deactivate('sleep')
    expect(relay.stop).toHaveBeenLastCalledWith('sleep')
    await controller.start()
    expect(relay.start).toHaveBeenCalledTimes(2)

    await controller.setEnabled(false)
    expect(relay.stop).toHaveBeenLastCalledWith('mobile-access-disabled')
    await controller.dispose()
    expect(relay.stop).toHaveBeenLastCalledWith('quit')
  })

  it('drives the real Settings lifecycle through authenticated transport verbs', async () => {
    const authorization = {
      accessToken: 'desktop-access',
      proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
    }
    const authorizeCurrentInstallation = vi.fn(async () => authorization)
    const account = {
      authorizeCurrentInstallation,
      getSnapshot: signedInAccountSnapshot,
    }
    const transport = transportFixture()
    const scheduled: Array<() => void> = []
    const controller = new DesktopPairingController({
      account,
      transport,
      randomId: () => 'rendezvous-one',
      schedule: (task) => { scheduled.push(task); return { unref: vi.fn() } as never },
    })

    await controller.start()
    await controller.setEnabled(true)
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', enabled: true })
    await controller.createChallenge()
    expect(controller.getSnapshot()).toMatchObject({
      status: 'challenge',
      challenge: { id: 'challenge-one', oneTimeLink: 'https://platform.example/pair?full=1' },
    })

    vi.mocked(transport.listPendingPairings).mockResolvedValueOnce([{
      pendingPairingId: parsePendingPairingId('pending-one'),
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
      desktopHandshake: Uint8Array.of(1),
      device: { name: 'Alice phone', platform: 'ios' },
    }])
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(controller.getSnapshot()).toMatchObject({ status: 'pending' }) })
    expect(controller.getSnapshot()).toMatchObject({ status: 'pending', pending: { id: 'pending-one' } })
    await controller.confirm(parsePendingPairingId('pending-one'))
    expect(transport.confirmPairing).toHaveBeenCalledOnce()
    expect(authorizeCurrentInstallation).toHaveBeenCalled()
  })

  it('deactivation drains an in-flight poll and rejects work after sign-out or close', async () => {
    const transport = transportFixture()
    const relay = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) }
    const scheduled: Array<() => void> = []
    const controller = new DesktopPairingController({
      account: {
        getSnapshot: signedInAccountSnapshot,
        authorizeCurrentInstallation: vi.fn(async () => ({
          accessToken: 'desktop-access',
          proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
        })),
      },
      transport,
      relay,
      schedule: (task) => { scheduled.push(task); return { unref: vi.fn() } as never },
    })
    await controller.start()
    await controller.setEnabled(true)
    const refresh = deferred<{ enabled: boolean }>()
    transport.getMobileAccessState.mockReturnValueOnce(refresh.promise)
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(transport.getMobileAccessState).toHaveBeenCalledTimes(3) })

    let drained = false
    const deactivating = controller.deactivate().then(() => { drained = true })
    await Promise.resolve()
    expect(relay.stop).toHaveBeenCalledWith('quit')
    expect(drained).toBe(false)
    refresh.resolve({ enabled: true })
    await deactivating
    expect(scheduled).toEqual([])
    await expect(controller.createChallenge()).rejects.toThrow('inactive')

    await controller.start()
    await controller.dispose()
    await expect(controller.start()).rejects.toThrow('closed')
    await expect(controller.setEnabled(true)).rejects.toThrow('inactive')
  })

  it('does not let an old deferred stop close a resumed lifecycle owner', async () => {
    const transport = transportFixture()
    const stopRelease = deferred<undefined>()
    const stopEntered = deferred<undefined>()
    const relay = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async (reason?: string) => {
        if (reason === 'sleep') {
          stopEntered.resolve(undefined)
          await stopRelease.promise
        }
      }),
    }
    const controller = new DesktopPairingController({
      account: {
        getSnapshot: signedInAccountSnapshot,
        authorizeCurrentInstallation: vi.fn(async () => ({
          accessToken: 'desktop-access',
          proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
        })),
      },
      transport,
      relay,
    })
    await controller.start()
    await controller.setEnabled(true)
    const startsBeforeSuspend = relay.start.mock.calls.length

    const suspending = controller.deactivate('sleep')
    await stopEntered.promise
    const resuming = controller.start()
    await Promise.resolve()
    expect(relay.start).toHaveBeenCalledTimes(startsBeforeSuspend)

    stopRelease.resolve(undefined)
    await suspending
    await resuming
    expect(relay.start).toHaveBeenCalledTimes(startsBeforeSuspend + 1)
    await controller.dispose()
  })

  it('stays locally offline when the remote disable mutation fails and recovers only on explicit enable', async () => {
    const transport = transportFixture()
    const relay = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) }
    const controller = new DesktopPairingController({
      account: {
        getSnapshot: signedInAccountSnapshot,
        authorizeCurrentInstallation: vi.fn(async () => ({
          accessToken: 'desktop-access',
          proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
        })),
      },
      transport,
      relay,
    })
    await controller.start()
    await controller.setEnabled(true)
    transport.setMobileAccess.mockRejectedValueOnce(new Error('disable failed'))

    await expect(controller.setEnabled(false)).rejects.toThrow('disable failed')
    expect(relay.stop).toHaveBeenLastCalledWith('mobile-access-disabled')
    expect(controller.getSnapshot()).toMatchObject({ status: 'failed', enabled: false, error: 'disable failed' })

    await controller.setEnabled(true)
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', enabled: true })
    expect(relay.start).toHaveBeenCalledTimes(2)
    await controller.dispose()
  })

  it('drops Account A projection before Account B starts even when its first refresh fails', async () => {
    const accountId = { value: 'account-a' }
    const account = {
      getSnapshot: vi.fn(() => ({
        status: 'signed-in' as const,
        privacyAccepted: true,
        account: {
          id: accountId.value as never,
          githubId: 1,
          githubLogin: accountId.value,
          avatarUrl: 'https://avatars.example/account',
        },
      })),
      authorizeCurrentInstallation: vi.fn(async () => ({
        accessToken: `${accountId.value}-access`,
        proof: { jti: parseAccountProofJti(`${accountId.value}-proof`), issuedAt: 1, signature: 'signature' },
      })),
    }
    const transport = transportFixture()
    const controller = new DesktopPairingController({ account, transport })

    await controller.start()
    await controller.setEnabled(true)
    expect(controller.getSnapshot().pairings).toHaveLength(1)
    await controller.deactivate()
    expect(controller.getSnapshot()).toEqual({ status: 'ready', enabled: false, pairings: [] })

    accountId.value = 'account-b'
    transport.getMobileAccessState.mockRejectedValueOnce(new Error('account B refresh failed'))
    await expect(controller.start()).rejects.toThrow('account B refresh failed')
    expect(controller.getSnapshot()).toEqual({
      status: 'failed', enabled: false, pairings: [], error: 'account B refresh failed',
    })
  })

  it('pushes an Account reset through the bound renderer source before Account B refreshes', async () => {
    const accountId = { value: 'account-a' }
    const account = {
      getSnapshot: vi.fn(() => ({
        status: 'signed-in' as const,
        privacyAccepted: true,
        account: {
          id: accountId.value as never,
          githubId: 1,
          githubLogin: accountId.value,
          avatarUrl: 'https://avatars.example/account',
        },
      })),
      authorizeCurrentInstallation: vi.fn(async () => ({
        accessToken: `${accountId.value}-access`,
        proof: {
          jti: parseAccountProofJti(`${accountId.value}-proof`),
          issuedAt: 1,
          signature: 'signature',
        },
      })),
    }
    const transport = transportFixture()
    const controller = new DesktopPairingController({ account, transport })
    const source = createDesktopPairingSource()
    bindDesktopPairing(source, {
      pairingGetSnapshot: async () => controller.getSnapshot(),
      onPairingSnapshot: listener => controller.subscribe(listener),
    })
    const rendererSubscriber = vi.fn()
    source.subscribe(rendererSubscriber)

    await controller.start()
    await controller.setEnabled(true)
    expect(source.getSnapshot()).toMatchObject({
      status: 'ready', enabled: true, pairings: [{ id: 'pairing-one' }],
    })

    const callsBeforeReset = rendererSubscriber.mock.calls.length
    const deactivating = controller.deactivate()
    expect(source.getSnapshot()).toEqual({ status: 'ready', enabled: false, pairings: [] })
    expect(rendererSubscriber).toHaveBeenCalledTimes(callsBeforeReset + 1)
    await deactivating
    expect(rendererSubscriber).toHaveBeenCalledTimes(callsBeforeReset + 1)

    accountId.value = 'account-b'
    const refresh = deferred<{ enabled: boolean }>()
    transport.getMobileAccessState.mockReturnValueOnce(refresh.promise)
    const starting = controller.start()
    await Promise.resolve()
    expect(source.getSnapshot()).toEqual({ status: 'ready', enabled: false, pairings: [] })
    expect(rendererSubscriber).toHaveBeenCalledTimes(callsBeforeReset + 1)

    refresh.reject(new Error('account B refresh failed'))
    await expect(starting).rejects.toThrow('account B refresh failed')
    expect(source.getSnapshot()).toEqual({
      status: 'failed', enabled: false, pairings: [], error: 'account B refresh failed',
    })
  })

  it('parses Electron IPC payloads before controller side effects', () => {
    expectTypeOf<DesktopPairingChallenge['id']>().toEqualTypeOf<PairingChallengeId>()
    expectTypeOf<DesktopPendingPairing['id']>().toEqualTypeOf<PendingPairingId>()
    expectTypeOf<DesktopPersonalPairing['id']>().toEqualTypeOf<PersonalPairingId>()
    expectTypeOf<DesktopBridge['pairingConfirm']>().parameter(0).toEqualTypeOf<PendingPairingId>()
    expectTypeOf<DesktopBridge['pairingReject']>().parameter(0).toEqualTypeOf<PendingPairingId>()
    expect(parsePairingEnabled(true)).toBe(true)
    expect(() => parsePairingEnabled('true')).toThrow('must be boolean')
    expect(parseDesktopPendingPairingId('pending-one')).toBe('pending-one')
    expect(() => parseDesktopPendingPairingId('')).toThrow('must be non-empty')

    const actions = { setEnabled: vi.fn(), confirm: vi.fn(), reject: vi.fn() }
    expect(() => setPairingEnabledFromIpc(actions, 'true')).toThrow('must be boolean')
    expect(() => confirmPairingFromIpc(actions, '')).toThrow('must be non-empty')
    expect(() => rejectPairingFromIpc(actions, [])).toThrow('must be non-empty')
    expect(actions.setEnabled).not.toHaveBeenCalled()
    expect(actions.confirm).not.toHaveBeenCalled()
    expect(actions.reject).not.toHaveBeenCalled()
  })
})

function transportFixture() {
  return {
    getMobileAccessState: vi.fn().mockResolvedValueOnce({ enabled: false }).mockResolvedValue({ enabled: true }),
    setMobileAccess: vi.fn(async (input: { enabled: boolean }) => ({ enabled: input.enabled })),
    createChallenge: vi.fn().mockResolvedValue({
      challengeId: parsePairingChallengeId('challenge-one'),
      desktopFingerprint: 'fingerprint',
      rendezvousId: 'rendezvous-one' as never,
      expiresAt: Date.now() + 120_000,
      protocolMajor: 1,
      oneTimeLink: 'https://platform.example/pair?full=1',
      qrPayload: 'https://platform.example/pair?full=1',
    }),
    cancelChallenge: vi.fn(),
    listPendingPairings: vi.fn().mockResolvedValue([]),
    listPersonalPairings: vi.fn().mockResolvedValue([{
      id: parsePersonalPairingId('pairing-one'),
      devicePrincipal: {
        id: 'principal-one' as never,
        accountId: 'account-one' as never,
        installationId: 'mobile-one' as never,
        authority: 'companion-surface',
      },
      device: { name: 'Alice phone', platform: 'ios' },
      pairedAt: 1,
    }]),
    confirmPairing: vi.fn().mockResolvedValue({}),
    rejectPairing: vi.fn(),
    completeChallenge: vi.fn(),
    getMobilePairingStatus: vi.fn(),
  } satisfies RemoteAccessTransport
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

function signedInAccountSnapshot() {
  return {
    status: 'signed-in' as const,
    privacyAccepted: true,
    account: {
      id: 'account-one' as never,
      githubId: 1,
      githubLogin: 'account-one',
      avatarUrl: 'https://avatars.example/account',
    },
  }
}
