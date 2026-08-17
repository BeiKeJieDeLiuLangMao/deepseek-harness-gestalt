import { describe, expect, it, vi } from 'vitest'
import { parseAccountProofJti } from '@deepseek-ai/dsh-platform-account'
import {
  parsePairingChallengeId,
  parsePendingPairingId,
  parsePersonalPairingId,
} from '@deepseek-ai/dsh-remote-access'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
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
    await expect(controller.dispose()).resolves.toBeUndefined()
  })
})

describe('DesktopPairingController', () => {
  it('drives the real Settings lifecycle through authenticated transport verbs', async () => {
    const authorization = {
      accessToken: 'desktop-access',
      proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
    }
    const authorizeCurrentInstallation = vi.fn(async () => authorization)
    const account = { authorizeCurrentInstallation }
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

  it('parses Electron IPC payloads before controller side effects', () => {
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
    setMobileAccess: vi.fn().mockResolvedValue({ enabled: true }),
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
