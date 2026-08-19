import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { parseAccountProofJti, parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  DevelopmentKeylessPairingHandshakeProvider,
  PersonalPairingProvider,
  computePairingScopeAuthorization,
  deriveKeylessPairingKey,
  parsePairingCompletionId,
  parsePairingInvitationLink,
  parsePairingRendezvousId,
  parsePersonalPairingId,
  type PairingAccountAuthentication,
  type PairingHandshakeProvider,
} from '../src/index.ts'

const NOW = Date.parse('2026-08-18T10:00:00.000Z')

describe('PersonalPairingProvider pairing scope authority', () => {
  it('resolves a valid DSH-Pairing credential to its confirmed Personal Pairing', async () => {
    const { provider, pairingId, material } = await confirmedPairing()
    const authorization = await computePairingScopeAuthorization(pairingId, material)
    await expect(provider.authenticatePairingScope({ headers: { authorization } })).resolves.toBe(pairingId)
  })

  it('rejects missing, malformed, wrong-scheme, and tampered credentials', async () => {
    const { provider, pairingId, material } = await confirmedPairing()
    const valid = await computePairingScopeAuthorization(pairingId, material)
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`
    const cases: Array<string | string[] | undefined> = [
      undefined,
      ['DSH-Pairing a.b', 'DSH-Pairing c.d'],
      '',
      'Bearer token',
      `DSH-Pairing ${pairingId}`,
      `DSH-Pairing ${pairingId}.`,
      'DSH-Pairing .proof',
      'DSH-Pairing bad id.proof',
      `DSH-Pairing ${pairingId}.proof with space`,
      tampered,
      await computePairingScopeAuthorization(pairingId, Uint8Array.from({ length: 32 }, () => 7)),
      await computePairingScopeAuthorization(parsePersonalPairingId('pairing-unknown'), material),
    ]
    for (const authorization of cases) {
      const headers = authorization === undefined ? {} : { authorization }
      await expect(provider.authenticatePairingScope({ headers })).rejects.toMatchObject({
        code: 'PAIRING_SCOPE_CREDENTIAL_INVALID',
      })
    }
  })

  it('rejects the credential of a revoked or unknown pairing', async () => {
    const { provider, pairingId, material, desktop } = await confirmedPairing()
    const authorization = await computePairingScopeAuthorization(pairingId, material)
    await provider.revokePersonalPairing({ desktop, pairingId })
    await expect(provider.authenticatePairingScope({ headers: { authorization } })).rejects.toMatchObject({
      code: 'PAIRING_SCOPE_CREDENTIAL_INVALID',
    })
  })

  it('fails loud when the crypto adapter cannot export pairing key material', async () => {
    const sealed = await confirmedPairing({
      createChallenge: vi.fn().mockResolvedValue({ desktopFingerprint: 'fingerprint', state: Uint8Array.of(1) }),
      completeChallenge: vi.fn().mockResolvedValue({
        handshakeHash: Uint8Array.from({ length: 32 }, (_, index) => index),
        desktopHandshake: Uint8Array.of(8),
        pendingPairingKey: Uint8Array.of(7),
      }),
      activatePairing: vi.fn().mockResolvedValue({
        keyReference: 'pairing-key-one', activePairingKey: Uint8Array.of(6),
      }),
      destroyChallenge: vi.fn(),
      destroyPendingPairing: vi.fn(),
      destroyPairing: vi.fn(),
    })
    await expect(sealed.provider.authenticatePairingScope({
      headers: { authorization: `DSH-Pairing ${sealed.pairingId}.proof` },
    })).rejects.toThrow('cannot export pairing key material')
  })

  it('rejects pairing key material below 256 bits at the proof boundary', async () => {
    await expect(computePairingScopeAuthorization(parsePersonalPairingId('pairing-one'), Uint8Array.of(1)))
      .rejects.toThrow('at least 256 bits')
  })
})

async function confirmedPairing(handshake?: PairingHandshakeProvider) {
  let id = 0
  const provider = new PersonalPairingProvider(new Context(), {
    account: {
      currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => {
        const [accountId, installationToken] = accessToken.split(':') as [string, string]
        const installationId = installationToken.replace(/-token$/u, '')
        return {
          account: {
            id: parsePlatformAccountId(accountId),
            githubId: 1,
            githubLogin: accountId,
            avatarUrl: 'https://avatars.example/account',
          },
          installation: {
            id: parseInstallationId(installationId),
            kind: installationId.includes('mobile') ? 'mobile' as const : 'desktop' as const,
          },
        }
      }),
    },
    handshake: handshake ?? new DevelopmentKeylessPairingHandshakeProvider(),
    clock: { now: () => NOW },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
  const authentication = (installationId: string): PairingAccountAuthentication => ({
    accessToken: `account-one:${installationId}-token`,
    proof: { jti: parseAccountProofJti(`${installationId}-proof`), issuedAt: NOW, signature: 'signature' },
  })
  const desktop = authentication('desktop-one')
  const mobile = authentication('mobile-one')
  await provider.setMobileAccess({ desktop, enabled: true })
  const challenge = await provider.createChallenge({
    desktop, rendezvousId: parsePairingRendezvousId('rendezvous-scope'),
  })
  const pending = await provider.completeChallenge({
    mobile,
    completionId: parsePairingCompletionId('completion-scope'),
    oneTimeLink: challenge.oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' },
    mobileHandshake: Uint8Array.of(9),
  })
  const pairing = await provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId })
  const invitation = parsePairingInvitationLink(challenge.oneTimeLink)
  const material = handshake === undefined
    ? await deriveKeylessPairingKey(invitation.invitationSecret)
    : Uint8Array.from({ length: 32 }, () => 3)
  invitation.invitationSecret.fill(0)
  return { provider, pairingId: pairing.id, material, desktop }
}
