import { describe, expect, it, vi } from 'vitest'
import { parseAccountProofJti } from '@deepseek-ai/dsh-platform-account'
import { parsePairingCompletionId, parsePendingPairingId } from '@deepseek-ai/dsh-remote-access'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import { MobilePairingController } from '../src/personal-pairing.ts'

describe('MobilePairingController', () => {
  it('uses the identical full-link completion flow for pasted links and native QR payloads', async () => {
    const link = pairingLink(Date.parse('2026-08-18T10:02:00.000Z'))
    const authorizeCurrentInstallation = vi.fn(async () => ({
      accessToken: 'mobile-access',
      proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
    }))
    const installation = { authorizeCurrentInstallation }
    const transport = transportFixture()
    const handshake = {
      begin: vi.fn(async () => ({
        completionId: parsePairingCompletionId(crypto.randomUUID()),
        mobileHandshake: Uint8Array.of(9),
      })),
      acceptDesktopHandshake: vi.fn(),
    }
    const scanner = { scan: vi.fn(async () => link) }
    let scheduled: (() => void) | undefined
    const controller = new MobilePairingController({
      installation,
      transport,
      handshake,
      scanner,
      device: { name: 'Alice phone', platform: 'ios' },
      schedule: (task) => { scheduled = task; return 1 },
      now: () => Date.parse('2026-08-18T10:01:00.000Z'),
    })

    await controller.completeLink(link)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'pending',
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
    })
    await controller.scanQr()

    expect(handshake.begin).toHaveBeenCalledOnce()
    expect(handshake.begin).toHaveBeenCalledWith(link)
    expect(transport.completeChallenge).toHaveBeenCalledTimes(2)
    expect(handshake.acceptDesktopHandshake).toHaveBeenCalledTimes(2)
    expect(authorizeCurrentInstallation).toHaveBeenCalledTimes(2)
    scheduled?.()
    await vi.waitFor(() => { expect(controller.getSnapshot()).toEqual({ status: 'paired' }) })
  })

  it('retries a lost completion response with the same prepared handshake attempt', async () => {
    const link = pairingLink(Date.parse('2026-08-18T10:02:00.000Z'))
    const transport = transportFixture()
    transport.completeChallenge
      .mockRejectedValueOnce(new Error('completion response was lost'))
      .mockResolvedValueOnce({
        pendingPairingId: parsePendingPairingId('pending-replayed'),
        authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
        desktopHandshake: Uint8Array.of(8),
        device: { name: 'Alice phone', platform: 'ios' },
      })
    const handshake = {
      begin: vi.fn(async () => ({
        completionId: parsePairingCompletionId('completion-retry'),
        mobileHandshake: Uint8Array.of(9),
      })),
      acceptDesktopHandshake: vi.fn(),
    }
    const controller = new MobilePairingController({
      installation: installationFixture(),
      transport,
      handshake,
      scanner: { scan: vi.fn() },
      device: { name: 'Alice phone', platform: 'ios' },
      now: () => Date.parse('2026-08-18T10:01:00.000Z'),
    })

    await expect(controller.completeLink(link)).rejects.toThrow('completion response was lost')
    expect(controller.getSnapshot()).toEqual({
      status: 'retryable',
      error: 'completion response was lost',
    })
    await controller.retryPairing()

    expect(handshake.begin).toHaveBeenCalledOnce()
    expect(transport.completeChallenge).toHaveBeenCalledTimes(2)
    const [first, second] = transport.completeChallenge.mock.calls.map(([request]) => ({
      completionId: request.completionId,
      oneTimeLink: request.oneTimeLink,
      mobileHandshake: request.mobileHandshake,
    }))
    expect(second).toEqual(first)
    expect(controller.getSnapshot()).toMatchObject({ status: 'pending' })
  })

  it('retains one attempt until its invitation expires, then prepares a replacement', async () => {
    const now = { value: Date.parse('2026-08-18T10:01:00.000Z') }
    const firstLink = pairingLink(Date.parse('2026-08-18T10:02:00.000Z'))
    const replacementLink = pairingLink(Date.parse('2026-08-18T10:04:00.000Z'), 'challenge-two')
    const transport = transportFixture()
    transport.completeChallenge.mockRejectedValueOnce(new Error('network unavailable'))
    const handshake = {
      begin: vi.fn(async () => ({
        completionId: parsePairingCompletionId(crypto.randomUUID()),
        mobileHandshake: Uint8Array.of(9),
      })),
      acceptDesktopHandshake: vi.fn(),
    }
    const controller = new MobilePairingController({
      installation: installationFixture(),
      transport,
      handshake,
      scanner: { scan: vi.fn() },
      device: { name: 'Alice phone', platform: 'ios' },
      now: () => now.value,
    })

    await expect(controller.completeLink(firstLink)).rejects.toThrow('network unavailable')
    await expect(controller.completeLink(replacementLink))
      .rejects.toThrow('Retry the retained Personal Pairing attempt')
    expect(handshake.begin).toHaveBeenCalledOnce()

    now.value = Date.parse('2026-08-18T10:02:00.000Z')
    await controller.completeLink(replacementLink)
    expect(handshake.begin).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toMatchObject({ status: 'pending' })
  })

  it('deactivation drains in-flight work, stops polling, and rejects post-sign-out verbs', async () => {
    const link = pairingLink(Date.parse('2026-08-18T10:02:00.000Z'))
    const completion = deferred<Awaited<ReturnType<RemoteAccessTransport['completeChallenge']>>>()
    const transport = transportFixture()
    transport.completeChallenge.mockReturnValueOnce(completion.promise)
    const scheduled: Array<() => void> = []
    const handshake = {
      begin: vi.fn(async () => ({
        completionId: parsePairingCompletionId('completion-drain'),
        mobileHandshake: Uint8Array.of(9),
      })),
      acceptDesktopHandshake: vi.fn(),
    }
    const controller = new MobilePairingController({
      installation: installationFixture(),
      transport,
      handshake,
      scanner: { scan: vi.fn() },
      device: { name: 'Alice phone', platform: 'ios' },
      schedule: (task) => { scheduled.push(task); return { unref: vi.fn() } as never },
      now: () => Date.parse('2026-08-18T10:01:00.000Z'),
    })

    const completing = controller.completeLink(link)
    await vi.waitFor(() => { expect(transport.completeChallenge).toHaveBeenCalledOnce() })
    let drained = false
    const deactivating = controller.deactivate().then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    completion.resolve({
      pendingPairingId: parsePendingPairingId('pending-drain'),
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
      desktopHandshake: Uint8Array.of(8),
      device: { name: 'Alice phone', platform: 'ios' },
    })
    await expect(completing).rejects.toThrow('inactive')
    await deactivating
    expect(handshake.acceptDesktopHandshake).not.toHaveBeenCalled()
    expect(scheduled).toEqual([])
    await expect(controller.retryPairing()).rejects.toThrow('inactive')
    await expect(controller.completeLink(link)).rejects.toThrow('inactive')
  })
})

function pairingLink(expiresAt: number, challengeId = 'challenge-one'): string {
  return `https://platform.example/pair?challenge=${challengeId}&secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&fingerprint=desktop-fingerprint&rendezvous=rendezvous-one&expires=${String(expiresAt)}&protocol=1`
}

function installationFixture() {
  return {
    authorizeCurrentInstallation: vi.fn(async () => ({
      accessToken: 'mobile-access',
      proof: { jti: parseAccountProofJti('proof'), issuedAt: 1, signature: 'signature' },
    })),
  }
}

function transportFixture() {
  return {
    getMobileAccessState: vi.fn(),
    setMobileAccess: vi.fn(),
    createChallenge: vi.fn(),
    cancelChallenge: vi.fn(),
    listPendingPairings: vi.fn(),
    listPersonalPairings: vi.fn(),
    confirmPairing: vi.fn(),
    rejectPairing: vi.fn(),
    completeChallenge: vi.fn<RemoteAccessTransport['completeChallenge']>().mockResolvedValue({
      pendingPairingId: parsePendingPairingId('pending-one'),
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
      desktopHandshake: Uint8Array.of(8),
      device: { name: 'Alice phone', platform: 'ios' },
    }),
    getMobilePairingStatus: vi.fn().mockResolvedValue({ status: 'paired', pairingId: 'pairing-one' }),
  } satisfies RemoteAccessTransport
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
