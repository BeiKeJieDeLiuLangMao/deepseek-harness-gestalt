import { describe, expect, it, vi } from 'vitest'
import { parseAccountProofJti } from '@deepseek-ai/dsh-platform-account'
import { parsePairingCompletionId, parsePendingPairingId } from '@deepseek-ai/dsh-remote-access'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import { MobilePairingController } from '../src/personal-pairing.ts'

describe('MobilePairingController', () => {
  it('uses the identical full-link completion flow for pasted links and native QR payloads', async () => {
    const link = 'https://platform.example/pair?complete=high-entropy'
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
    })

    await controller.completeLink(link)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'pending',
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
    })
    await controller.scanQr()

    expect(handshake.begin).toHaveBeenNthCalledWith(1, link)
    expect(handshake.begin).toHaveBeenNthCalledWith(2, link)
    expect(transport.completeChallenge).toHaveBeenCalledTimes(2)
    expect(handshake.acceptDesktopHandshake).toHaveBeenCalledTimes(2)
    expect(authorizeCurrentInstallation).toHaveBeenCalledTimes(2)
    scheduled?.()
    await vi.waitFor(() => { expect(controller.getSnapshot()).toEqual({ status: 'paired' }) })
  })
})

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
    completeChallenge: vi.fn().mockResolvedValue({
      pendingPairingId: parsePendingPairingId('pending-one'),
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
      desktopHandshake: Uint8Array.of(8),
      device: { name: 'Alice phone', platform: 'ios' },
    }),
    getMobilePairingStatus: vi.fn().mockResolvedValue({ status: 'paired', pairingId: 'pairing-one' }),
  } satisfies RemoteAccessTransport
}
