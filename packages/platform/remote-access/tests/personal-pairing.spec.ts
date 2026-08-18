import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { AccountProof, PlatformAccountView } from '@deepseek-ai/dsh-platform-account'
import { parseAccountProofJti, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION,
  MAX_PENDING_PAIRINGS_PER_INSTALLATION,
  MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION,
  PERSONAL_PAIRING_PROTOCOL_MAJOR,
  PAIRING_CHALLENGE_TTL_MS,
  PAIRING_REPLAY_RETENTION_MS,
  MemoryPersonalPairingAuthorityStore,
  PersonalPairingProvider,
  RemoteAccessError,
  deriveAuthenticationWords,
  parseDevicePrincipalId,
  parsePairingChallengeId,
  parsePairingInvitationLink,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  parsePendingPairingId,
  parsePersonalPairingId,
  type PairingHandshakeProvider,
} from '../src/index.ts'

const NOW = Date.parse('2026-08-18T10:00:00.000Z')

describe('PersonalPairingProvider', () => {
  it('keeps a replacement route when stale disable cleanup completes', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const untouched = new MemoryPersonalPairingAuthorityStore()
    const accountId = 'account-one' as never
    const desktopId = parseInstallationId('desktop-one')
    const first = parseRelayRouteId('route-first')
    const second = parseRelayRouteId('route-second')
    expect(await authority.enableDesktop(accountId, desktopId, first)).toBe(first)
    expect(await authority.disableDesktop(accountId, desktopId)).toEqual([first])
    expect(await authority.enableDesktop(accountId, desktopId, second)).toBe(second)
    await authority.completeRouteRevocation(accountId, desktopId, first)
    expect(await authority.getDesktop(accountId, desktopId)).toEqual({ enabled: true, routeId: second })
    await untouched.completeRouteRevocation(accountId, desktopId, first)
    expect(await authority.disableDesktop(accountId, parseInstallationId('desktop-missing'))).toEqual([])
    await authority.completeRouteRevocation(accountId, parseInstallationId('desktop-missing'), first)
  })

  it('rejects a conflicting shared Mobile pairing result without replacing the first authority', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const pendingPairingId = parsePendingPairingId('pending-shared')
    const first = {
      accountId: 'account-one' as never,
      desktopInstallationId: parseInstallationId('desktop-one'),
      mobileInstallationId: parseInstallationId('mobile-one'),
      pendingPairingId,
      pairingId: parsePersonalPairingId('pairing-one'),
    }
    await authority.confirmMobilePairing(first)
    await authority.confirmMobilePairing(first)
    const sealed = { ...first, pendingPairingId: parsePendingPairingId('pending-sealed'), sealedRelayAuthority: Uint8Array.of(1, 2) }
    await authority.confirmMobilePairing(sealed)
    await authority.confirmMobilePairing({ ...sealed, sealedRelayAuthority: Uint8Array.of(1, 2) })
    await authority.disableDesktop(first.accountId, parseInstallationId('desktop-other'))

    await expect(authority.confirmMobilePairing({
      ...first,
      pairingId: parsePersonalPairingId('pairing-two'),
    })).rejects.toMatchObject({ code: 'PAIRING_ID_COLLISION' })
    await expect(authority.confirmMobilePairing({
      ...sealed, sealedRelayAuthority: Uint8Array.of(1, 3),
    })).rejects.toMatchObject({ code: 'PAIRING_ID_COLLISION' })
    expect(await authority.getMobilePairing(pendingPairingId)).toEqual(first)
  })

  it('shares Desktop access and pairing authority across Platform providers', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const routeId = parseRelayRouteId('shared-route')
    const desktopCredential = parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    const mobileCredential = parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE')
    const relay = {
      rotateCredential: vi.fn(async () => ({ routeId, endpoint: 'desktop' as const, credential: desktopCredential, revision: 1 })),
      issueCredential: vi.fn(async () => ({ routeId, endpoint: 'mobile' as const, credential: mobileCredential, revision: 1 })),
      revokeCredential: vi.fn(async () => {}),
      revokeRoute: vi.fn(async () => {}),
    }
    const sharedHandshake = {
      ...handshakeProvider(),
      sealMobileRelayAuthority: vi.fn(async ({ grant }: { grant: { routeId: string; credential: string; revision: number } }) =>
        new TextEncoder().encode(JSON.stringify(grant))),
    }
    let id = 0
    const create = () => new PersonalPairingProvider(new Context(), {
      account: { currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)) },
      handshake: sharedHandshake,
      relay,
      authority,
      randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
      randomId: kind => kind === 'relay-route' ? routeId : `${kind}-${String(++id)}`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const platformA = create()
    const platformB = create()
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')

    const enabled = await platformA.setMobileAccess({ desktop, enabled: true })
    expect(enabled.relay?.credential).toBe(desktopCredential)
    expect(await platformB.getMobileAccessState(desktop)).toEqual({ enabled: true })
    const challenge = await platformA.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('shared-authority'),
    })
    const pending = await platformA.completeChallenge({
      mobile,
      completionId: parsePairingCompletionId('shared-authority'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })
    const pairing = await platformA.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId })
    const mobileStatus = await platformB.getMobilePairingStatus({ mobile, pendingPairingId: pending.pendingPairingId })
    expect(mobileStatus).toMatchObject({ status: 'paired', pairingId: pairing.id })
    const localStatus = await platformA.getMobilePairingStatus({ mobile, pendingPairingId: pending.pendingPairingId })
    expect(localStatus.status).toBe('paired')
    if (localStatus.status !== 'paired') throw new Error('expected paired local status')
    expect(localStatus.sealedRelayAuthority).toBeInstanceOf(Uint8Array)
    expect(relay.issueCredential).toHaveBeenCalledWith(routeId, 'mobile')
    expect(mobileCredential).not.toBe(desktopCredential)

    await platformB.setMobileAccess({ desktop, enabled: false })
    expect(await platformA.getMobileAccessState(desktop)).toEqual({ enabled: false })
    expect(relay.revokeRoute).toHaveBeenCalledWith(routeId)
    await expect(platformA.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('disabled-on-other-instance'),
    })).rejects.toMatchObject({ code: 'MOBILE_ACCESS_DISABLED' })
    await expect(platformB.getMobilePairingStatus({ mobile, pendingPairingId: pending.pendingPairingId }))
      .resolves.toEqual({ status: 'rejected' })
    expect(await platformA.getMobilePairingStatus({ mobile, pendingPairingId: pending.pendingPairingId }))
      .toEqual({ status: 'rejected' })

    await Promise.all([platformA.dispose(), platformB.dispose()])
    expect(relay.revokeRoute).toHaveBeenCalledTimes(1)
  })

  it('reads an unsealed shared pairing result on a replacement Platform provider', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const pendingPairingId = parsePendingPairingId('pending-unsealed-replacement')
    await authority.confirmMobilePairing({
      accountId: 'account-one' as never,
      desktopInstallationId: parseInstallationId('desktop-installation'),
      mobileInstallationId: parseInstallationId('mobile-installation'),
      pendingPairingId,
      pairingId: parsePersonalPairingId('pairing-unsealed-replacement'),
    })
    const provider = new PersonalPairingProvider(new Context(), {
      account: { currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)) },
      handshake: handshakeProvider(), authority, pairingLinkOrigin: 'https://platform.example.com/pair',
    })

    expect(await provider.getMobilePairingStatus({
      mobile: authentication('mobile-installation'), pendingPairingId,
    })).toEqual({ status: 'paired', pairingId: 'pairing-unsealed-replacement' })
  })

  it.each(['route-disabled', 'missing-sealer'] as const)(
    'fails closed during Mobile authority activation when %s',
    async (failure) => {
      const authority = new MemoryPersonalPairingAuthorityStore()
      const routeId = parseRelayRouteId(`route-${failure}`)
      const handshake = {
        ...handshakeProvider(),
        ...(failure === 'missing-sealer'
          ? {}
          : { sealMobileRelayAuthority: vi.fn(async () => Uint8Array.of(1)) }),
      }
      const relay = {
        rotateCredential: vi.fn(async () => ({
          routeId, endpoint: 'desktop' as const,
          credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), revision: 1,
        })),
        issueCredential: vi.fn(async () => ({
          routeId, endpoint: 'mobile' as const,
          credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'), revision: 1,
        })),
        revokeCredential: vi.fn(async () => {}),
        revokeRoute: vi.fn(),
      }
      const provider = new PersonalPairingProvider(new Context(), {
        account: { currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)) },
        handshake,
        relay,
        authority,
        randomBytes: size => new Uint8Array(size),
        randomId: kind => kind === 'relay-route' ? routeId : `${kind}-${failure}`,
        pairingLinkOrigin: 'https://platform.example.com/pair',
      })
      const desktop = authentication('desktop-installation')
      await provider.setMobileAccess({ desktop, enabled: true })
      const challenge = await provider.createChallenge({
        desktop, rendezvousId: parsePairingRendezvousId(`rendezvous-${failure}`),
      })
      const pending = await complete(provider, challenge.oneTimeLink, failure)
      if (failure === 'route-disabled') {
        await authority.disableDesktop('account-one' as never, parseInstallationId('desktop-installation'))
      }

      await expect(provider.confirmPairing({
        desktop, pendingPairingId: pending.pendingPairingId,
      })).rejects.toThrow(failure === 'route-disabled' ? 'Mobile Access is disabled' : 'cannot seal')
      expect(handshake.destroyPairing).toHaveBeenCalledOnce()
    },
  )

  it('keeps Mobile Access disabled until the Desktop Settings verb enables it', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation', 'account-one')

    expect(await provider.getMobileAccessState(desktop)).toEqual({ enabled: false })
    await expect(provider.createChallenge({ desktop, rendezvousId: 'disabled' as never })).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'MOBILE_ACCESS_DISABLED' }),
    )
    expect(handshake.createChallenge).not.toHaveBeenCalled()

    expect(await provider.setMobileAccess({ desktop, enabled: true })).toEqual({ enabled: true })
    await expect(provider.createChallenge({ desktop, rendezvousId: 'enabled' as never })).resolves.toBeDefined()
  })

  it('rejects Relay composition without a deployment-owned shared authority store', () => {
    expect(() => new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake: handshakeProvider(),
      relay: {
        rotateCredential: vi.fn(),
        issueCredential: vi.fn(),
        revokeCredential: vi.fn(),
        revokeRoute: vi.fn(),
      },
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })).toThrow('shared authority store')
  })

  it('rotates and revokes Relay authority through the authenticated Settings mutation', async () => {
    const routeId = parseRelayRouteId('relay-route-id')
    const credential = parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    const relay = {
      rotateCredential: vi.fn(async () => ({ routeId, endpoint: 'desktop' as const, credential, revision: 1 })),
      issueCredential: vi.fn(async () => ({ routeId, endpoint: 'mobile' as const, credential, revision: 1 })),
      revokeCredential: vi.fn(async () => {}),
      revokeRoute: vi.fn(async () => {}),
    }
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake: handshakeProvider(),
      relay,
      authority: new MemoryPersonalPairingAuthorityStore(),
      randomId: kind => `${kind}-id`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation', 'account-one')

    await expect(provider.setMobileAccess({ desktop, enabled: true })).resolves.toEqual({
      enabled: true,
      relay: { routeId, endpoint: 'desktop', credential, revision: 1 },
    })
    await provider.setMobileAccess({ desktop, enabled: true })
    expect(relay.rotateCredential).toHaveBeenNthCalledWith(1, routeId, 'desktop')
    expect(relay.rotateCredential).toHaveBeenNthCalledWith(2, routeId, 'desktop')

    await provider.setMobileAccess({ desktop, enabled: false })
    expect(relay.revokeRoute).toHaveBeenCalledOnce()
    expect(await provider.getMobileAccessState(desktop)).toEqual({ enabled: false })
    await provider.dispose()
  })

  it('rolls back a newly enabled shared route when its first credential rotation fails', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const routeId = parseRelayRouteId('relay-route-failed-enable')
    const relay = {
      rotateCredential: vi.fn(async () => { throw new Error('route store unavailable') }),
      issueCredential: vi.fn(),
      revokeCredential: vi.fn(async () => {}),
      revokeRoute: vi.fn(async () => {}),
    }
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake: handshakeProvider(),
      relay,
      authority,
      randomId: kind => kind === 'relay-route' ? routeId : `${kind}-id`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation', 'account-one')

    await expect(provider.setMobileAccess({ desktop, enabled: true })).rejects.toThrow('route store unavailable')
    expect(await provider.getMobileAccessState(desktop)).toEqual({ enabled: false })
    expect(relay.revokeRoute).toHaveBeenCalledWith(routeId)
  })

  it('keeps an existing shared route enabled when a later credential rotation fails', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const routeId = parseRelayRouteId('relay-route-existing')
    const relay = {
      rotateCredential: vi.fn()
        .mockResolvedValueOnce({
          routeId, endpoint: 'desktop' as const, credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), revision: 1,
        })
        .mockRejectedValueOnce(new Error('rotation unavailable')),
      issueCredential: vi.fn(),
      revokeCredential: vi.fn(),
      revokeRoute: vi.fn(),
    }
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')), handshake: handshakeProvider(), relay, authority,
      randomId: kind => kind === 'relay-route' ? routeId : `${kind}-id`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })

    await expect(provider.setMobileAccess({ desktop, enabled: true })).rejects.toThrow('rotation unavailable')

    expect(await provider.getMobileAccessState(desktop)).toEqual({ enabled: true })
    expect(relay.revokeRoute).not.toHaveBeenCalled()
  })

  it('reports both credential failure and failed fail-closed route cleanup', async () => {
    const relay = {
      rotateCredential: vi.fn(async () => { throw new Error('rotation unavailable') }),
      issueCredential: vi.fn(),
      revokeCredential: vi.fn(async () => {}),
      revokeRoute: vi.fn(async () => { throw new Error('revocation unavailable') }),
    }
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')), handshake: handshakeProvider(), relay,
      authority: new MemoryPersonalPairingAuthorityStore(),
      randomId: kind => `${kind}-rollback`, pairingLinkOrigin: 'https://platform.example.com/pair',
    })

    await expect(provider.setMobileAccess({
      desktop: authentication('desktop-installation', 'account-one'), enabled: true,
    })).rejects.toMatchObject({
      message: 'Mobile Access enable rollback failed', errors: [
        expect.objectContaining({ message: 'rotation unavailable' }), expect.any(AggregateError),
      ],
    })
  })

  it('completes shared authority cleanup when the keyless composition has no Relay provider', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const complete = vi.spyOn(authority, 'completeRouteRevocation')
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake: handshakeProvider(),
      authority,
      randomId: kind => `${kind}-id`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })

    await provider.setMobileAccess({ desktop, enabled: false })

    expect(complete).toHaveBeenCalledWith(
      'account-one', parseInstallationId('desktop-installation'), parseRelayRouteId('keyless-no-relay'),
    )
  })

  it('preserves durable Relay authority during provider disposal', async () => {
    const routeId = parseRelayRouteId('relay-route-dispose')
    const relay = {
      rotateCredential: vi.fn(async () => ({
        routeId,
        endpoint: 'desktop' as const,
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        revision: 1,
      })),
      issueCredential: vi.fn(async () => ({
        routeId,
        endpoint: 'mobile' as const,
        credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
        revision: 1,
      })),
      revokeCredential: vi.fn(async () => {}),
      revokeRoute: vi.fn(async () => {}),
    }
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake: handshakeProvider(),
      relay,
      authority: new MemoryPersonalPairingAuthorityStore(),
      randomId: kind => `${kind}-dispose`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    await provider.setMobileAccess({
      desktop: authentication('desktop-installation', 'account-one'), enabled: true,
    })

    await provider.dispose()

    expect(relay.revokeRoute).not.toHaveBeenCalled()
  })

  it('settles this instance live challenges when a shared-authority provider disposes', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const handshake = handshakeProvider()
    let ids = 0
    const options = {
      account: {
        currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
      },
      handshake,
      authority,
      clock: { now: () => NOW },
      randomBytes: (size: number) => Uint8Array.from({ length: size }, (_, index) => index),
      randomId: (kind: string) => `${kind}-${String(++ids)}`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    } as const
    const creator = new PersonalPairingProvider(new Context(), options)
    const desktop = authentication('desktop-installation', 'account-one')
    await creator.setMobileAccess({ desktop, enabled: true })
    await Promise.all(Array.from(
      { length: MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION },
      (_, index) => creator.createChallenge({
        desktop,
        rendezvousId: parsePairingRendezvousId(`shared-dispose-${String(index)}`),
      }),
    ))
    await creator.dispose()

    const successor = new PersonalPairingProvider(new Context(), {
      ...options,
      randomId: (kind: string) => `${kind}-successor-${String(++ids)}`,
    })
    await expect(successor.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('after-shared-dispose'),
    })).resolves.toMatchObject({ challengeId: expect.any(String) })
    await successor.dispose()
  })

  it('uses authenticated installation identity and role instead of caller claims', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation', 'account-one')
    const mobile = authentication('mobile-installation', 'account-one')

    await expect(provider.setMobileAccess({
      desktop: authentication('mobile-installation', 'account-one'),
      enabled: true,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({
      code: 'PAIRING_INSTALLATION_KIND_INVALID',
    }))

    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('authenticated-installation'),
    })
    await expect(provider.completeChallenge({
      mobile: authentication('other-desktop', 'account-one'),
      completionId: parsePairingCompletionId('desktop-token-on-mobile-verb'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Wrong role', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({
      code: 'PAIRING_INSTALLATION_KIND_INVALID',
    }))

    const pending = await provider.completeChallenge({
      mobile,
      completionId: parsePairingCompletionId('authenticated-mobile'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })
    await expect(provider.confirmPairing({
      desktop: authentication('other-desktop', 'account-one'),
      pendingPairingId: pending.pendingPairingId,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({
      code: 'PAIRING_PENDING_INVALID',
    }))
  })

  it('creates one two-minute high-entropy invitation for the Desktop Settings flow', async () => {
    const handshake = handshakeProvider()
    const provider = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake,
      clock: { now: () => NOW },
      randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
      randomId: kind => `${kind}-id`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    await provider.setMobileAccess({ desktop: authentication('desktop-installation'), enabled: true })

    const challenge = await provider.createChallenge({
      desktop: authentication('desktop-installation'),
      rendezvousId: 'rendezvous-id' as never,
    })

    expect(challenge.expiresAt).toBe(NOW + PAIRING_CHALLENGE_TTL_MS)
    expect(challenge.protocolMajor).toBe(PERSONAL_PAIRING_PROTOCOL_MAJOR)
    expect(challenge.desktopFingerprint).toBe('desktop-fingerprint')
    expect(challenge.qrPayload).toBe(challenge.oneTimeLink)
    const invitation = parsePairingInvitationLink(challenge.oneTimeLink)
    expect(invitation.invitationSecret).toHaveLength(32)
    expect(invitation).toMatchObject({
      challengeId: 'challenge-id',
      desktopFingerprint: 'desktop-fingerprint',
      rendezvousId: 'rendezvous-id',
      expiresAt: NOW + PAIRING_CHALLENGE_TTL_MS,
      protocolMajor: PERSONAL_PAIRING_PROTOCOL_MAJOR,
    })
    expect(handshake.createChallenge).toHaveBeenCalledOnce()
  })

  it('completes only for the same Platform Account and keeps authority pending', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    await provider.setMobileAccess({ desktop: authentication('desktop-installation', 'account-one'), enabled: true })
    const challenge = await provider.createChallenge({
      desktop: authentication('desktop-installation', 'account-one'),
      rendezvousId: 'rendezvous-id' as never,
    })

    const first = await provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-one'),
      completionId: parsePairingCompletionId('completion-one'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })
    const repeated = await provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-one'),
      completionId: parsePairingCompletionId('completion-one'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })

    expect(repeated).toEqual(first)
    expect(first.authenticationWords).toEqual(['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'])
    expect(first.desktopHandshake).toEqual(Uint8Array.of(8))
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
    expect(await provider.listPersonalPairings(authentication('desktop-installation', 'account-one'))).toEqual([])
  })

  it('destroys a cross-account invitation before granting any Device Principal', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    await provider.setMobileAccess({ desktop: authentication('desktop-installation', 'account-one'), enabled: true })
    const challenge = await provider.createChallenge({
      desktop: authentication('desktop-installation', 'account-one'),
      rendezvousId: 'rendezvous-id' as never,
    })

    await expect(provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-two'),
      completionId: parsePairingCompletionId('completion-cross-account'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Mallory phone', platform: 'android' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ACCOUNT_MISMATCH' }))
    await expect(provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-two'),
      completionId: parsePairingCompletionId('completion-cross-account-repeat'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Mallory phone', platform: 'android' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ACCOUNT_MISMATCH' }))
    await expect(provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-one'),
      completionId: parsePairingCompletionId('completion-cross-account-retry'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))
    expect(handshake.completeChallenge).not.toHaveBeenCalled()
    expect(handshake.destroyChallenge).toHaveBeenCalledOnce()
    expect(await provider.listPersonalPairings(authentication('desktop-installation', 'account-one'))).toEqual([])
  })

  it('grants only Companion Surface authority after explicit Desktop confirmation', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: 'rendezvous-id' as never })
    const completion = await provider.completeChallenge({
      mobile: authentication('mobile-installation', 'account-one'),
      completionId: parsePairingCompletionId('completion-confirm'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })

    expect(await provider.listPersonalPairings(desktop)).toEqual([])
    expect(await provider.listPendingPairings(desktop)).toEqual([completion])
    await expect(provider.getMobilePairingStatus({
      mobile: authentication('other-mobile', 'account-one'),
      pendingPairingId: completion.pendingPairingId,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
    expect(await provider.getMobilePairingStatus({
      mobile: authentication('mobile-installation', 'account-one'),
      pendingPairingId: completion.pendingPairingId,
    })).toEqual({ status: 'pending' })
    const first = await provider.confirmPairing({ desktop, pendingPairingId: completion.pendingPairingId })
    const repeated = await provider.confirmPairing({ desktop, pendingPairingId: completion.pendingPairingId })
    await expect(provider.confirmPairing({
      desktop: authentication('other-desktop-installation', 'account-one'),
      pendingPairingId: completion.pendingPairingId,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))

    expect(repeated).toEqual(first)
    expect(first.devicePrincipal.authority).toBe('companion-surface')
    expect(first.devicePrincipal.accountId).toBe('account-one')
    expect(first.device.name).toBe('Alice phone')
    expect(await provider.listPersonalPairings(desktop)).toEqual([first])
    expect(await provider.listPendingPairings(desktop)).toEqual([])
    expect(await provider.getMobilePairingStatus({
      mobile: authentication('mobile-installation', 'account-one'),
      pendingPairingId: completion.pendingPairingId,
    })).toEqual({ status: 'paired', pairingId: first.id })
    await expect(provider.getMobilePairingStatus({
      mobile: authentication('other-mobile', 'account-one'),
      pendingPairingId: completion.pendingPairingId,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
    expect(handshake.activatePairing).toHaveBeenCalledOnce()
    expect(handshake.destroyPendingPairing).toHaveBeenCalledOnce()
  })

  it('destroys expiry, cancellation, rejection, and successful-use capabilities', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake, now)
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })

    const expired = await provider.createChallenge({ desktop, rendezvousId: 'expired' as never })
    now.value += PAIRING_CHALLENGE_TTL_MS
    await expect(complete(provider, expired.oneTimeLink, 'expired')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_EXPIRED' }),
    )

    const cancelled = await provider.createChallenge({ desktop, rendezvousId: 'cancelled' as never })
    await provider.cancelChallenge({ desktop, challengeId: cancelled.challengeId })
    await provider.cancelChallenge({ desktop, challengeId: cancelled.challengeId })
    await expect(complete(provider, cancelled.oneTimeLink, 'cancelled')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }),
    )

    const rejected = await provider.createChallenge({ desktop, rendezvousId: 'rejected' as never })
    const pending = await complete(provider, rejected.oneTimeLink, 'rejected')
    await provider.rejectPairing({ desktop, pendingPairingId: pending.pendingPairingId })
    await provider.rejectPairing({ desktop, pendingPairingId: pending.pendingPairingId })
    expect(await provider.getMobilePairingStatus({
      mobile: authentication('mobile-installation', 'account-one'),
      pendingPairingId: pending.pendingPairingId,
    })).toEqual({ status: 'rejected' })
    await expect(provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId })).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }),
    )

    const used = await provider.createChallenge({ desktop, rendezvousId: 'used' as never })
    await complete(provider, used.oneTimeLink, 'used-first')
    await expect(complete(provider, used.oneTimeLink, 'used-second')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }),
    )

    expect(handshake.destroyChallenge).toHaveBeenCalledTimes(4)
    expect(handshake.destroyPendingPairing).toHaveBeenCalledOnce()
  })

  it('admits only one concurrent completion for one invitation', async () => {
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: 'concurrent' as never })

    const results = await Promise.allSettled([
      complete(provider, challenge.oneTimeLink, 'concurrent-one'),
      complete(provider, challenge.oneTimeLink, 'concurrent-two'),
    ])

    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
    expect(handshake.destroyChallenge).toHaveBeenCalledOnce()
  })

  it('bounds concurrent active state per authenticated Installation', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })

    const challenges = await Promise.all(Array.from(
      { length: MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION },
      (_, index) => provider.createChallenge({
        desktop,
        rendezvousId: parsePairingRendezvousId(`bounded-${String(index)}`),
      }),
    ))
    await expect(provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('over-challenge-limit'),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))
    expect(handshake.createChallenge).toHaveBeenCalledTimes(MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION)

    await provider.cancelChallenge({ desktop, challengeId: challenges[0]!.challengeId })
    const replacement = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('replacement'),
    })
    for (const challenge of [...challenges.slice(1), replacement]) {
      await complete(provider, challenge.oneTimeLink, challenge.challengeId)
    }
    const next = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('pending-limit') })
    await expect(complete(provider, next.oneTimeLink, 'over-pending-limit')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }),
    )
    expect(handshake.completeChallenge).toHaveBeenCalledTimes(MAX_PENDING_PAIRINGS_PER_INSTALLATION)
  })

  it('retains idempotent replay for a fixed window and evicts cleaned terminal projections', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake, now)
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('retention') })
    const input = {
      mobile,
      completionId: parsePairingCompletionId('retained-completion'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' as const },
      mobileHandshake: Uint8Array.of(9),
    }

    const first = await provider.completeChallenge(input)
    now.value += PAIRING_REPLAY_RETENTION_MS - 1
    expect(await provider.completeChallenge(input)).toEqual(first)
    await provider.rejectPairing({ desktop, pendingPairingId: first.pendingPairingId })
    expect(await provider.getMobilePairingStatus({ mobile, pendingPairingId: first.pendingPairingId }))
      .toEqual({ status: 'rejected' })

    now.value += 1
    await expect(provider.completeChallenge(input)).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }),
    )
    expect(await provider.getMobilePairingStatus({ mobile, pendingPairingId: first.pendingPairingId }))
      .toEqual({ status: 'rejected' })
    now.value += PAIRING_REPLAY_RETENTION_MS
    await expect(provider.getMobilePairingStatus({ mobile, pendingPairingId: first.pendingPairingId })).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }),
    )
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
  })

  it('keeps cleanup-failed replay tombstones past retention until retry succeeds', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    handshake.destroyChallenge.mockRejectedValueOnce(new Error('cleanup unavailable'))
    const provider = uniquePairingProvider(handshake, now)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('cleanup-retention') })
    const input = {
      mobile: authentication('mobile-installation'),
      completionId: parsePairingCompletionId('cleanup-retention'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' as const },
      mobileHandshake: Uint8Array.of(9),
    }

    await expect(provider.completeChallenge(input)).rejects.toThrow('cleanup unavailable')
    now.value += PAIRING_REPLAY_RETENTION_MS
    expect(typeof (await provider.completeChallenge(input)).pendingPairingId).toBe('string')
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
    expect(handshake.destroyChallenge).toHaveBeenCalledTimes(2)
  })

  it('bounds retained terminal records per Installation and never evicts cleanup failures early', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    handshake.destroyChallenge.mockRejectedValue(new Error('cleanup unavailable'))
    const provider = uniquePairingProvider(handshake, now)
    const desktop = authentication('desktop-installation')
    const otherDesktop = authentication('other-desktop')
    await provider.setMobileAccess({ desktop, enabled: true })
    await provider.setMobileAccess({ desktop: otherDesktop, enabled: true })
    const retained = []
    for (let index = 0; index < MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION; index += 1) {
      const challenge = await provider.createChallenge({
        desktop, rendezvousId: parsePairingRendezvousId(`retained-${String(index)}`),
      })
      retained.push(challenge)
      await expect(provider.cancelChallenge({ desktop, challengeId: challenge.challengeId }))
        .rejects.toThrow('cleanup unavailable')
    }

    await expect(provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId('retained-over-limit'),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))
    await expect(provider.createChallenge({
      desktop: otherDesktop, rendezvousId: parsePairingRendezvousId('isolated-installation'),
    })).resolves.toBeDefined()

    now.value += PAIRING_REPLAY_RETENTION_MS
    await expect(provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId('cleanup-still-retained'),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))

    handshake.destroyChallenge.mockResolvedValue(undefined)
    for (const challenge of retained) {
      await provider.cancelChallenge({ desktop, challengeId: challenge.challengeId })
    }
    await provider.getMobileAccessState(desktop)
    await expect(provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId('capacity-released'),
    })).resolves.toBeDefined()
  })

  it('releases cleaned retained-record capacity only after replay expiry', async () => {
    const now = { value: NOW }
    const provider = uniquePairingProvider(handshakeProvider(), now)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    for (let index = 0; index < MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION; index += 1) {
      const challenge = await provider.createChallenge({
        desktop, rendezvousId: parsePairingRendezvousId(`cleaned-${String(index)}`),
      })
      await provider.cancelChallenge({ desktop, challengeId: challenge.challengeId })
    }
    await expect(provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId('cleaned-over-limit'),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))
    now.value += PAIRING_REPLAY_RETENTION_MS
    await expect(provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId('cleaned-after-retention'),
    })).resolves.toBeDefined()
  })

  it('retains orphaned pending-key capacity by owning Installation until cleanup succeeds', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    handshake.destroyPendingPairing.mockRejectedValue(new Error('pending cleanup unavailable'))
    let invalidPendingId = true
    let sequence = 0
    const provider = new PersonalPairingProvider(new Context(), {
      account: {
        currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
      },
      handshake,
      clock: { now: () => now.value },
      randomBytes: size => new Uint8Array(size),
      randomId: kind => invalidPendingId && kind === 'completion' ? '' : `${kind}-${String(sequence += 1)}`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation', 'account-one')
    const mobile = authentication('mobile-installation', 'account-one')
    const otherDesktop = authentication('other-desktop', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })
    await provider.setMobileAccess({ desktop: otherDesktop, enabled: true })

    let blockedChallenge: Awaited<ReturnType<typeof provider.createChallenge>> | undefined
    for (let index = 0; index < MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION; index += 1) {
      const challenge = await provider.createChallenge({
        desktop,
        rendezvousId: parsePairingRendezvousId(`orphan-capacity-${String(index)}`),
      })
      const allocationCount = handshake.completeChallenge.mock.calls.length
      const result = await provider.completeChallenge({
        mobile,
        completionId: parsePairingCompletionId(`orphan-capacity-${String(index)}`),
        oneTimeLink: challenge.oneTimeLink,
        device: { name: 'Alice phone', platform: 'ios' },
        mobileHandshake: Uint8Array.of(9),
      }).catch((error: unknown) => error)
      if (result instanceof RemoteAccessError && result.code === 'PAIRING_RESOURCE_LIMIT') {
        expect(handshake.completeChallenge).toHaveBeenCalledTimes(allocationCount)
        blockedChallenge = challenge
        break
      }
      if (result instanceof RemoteAccessError) {
        throw new Error(`unexpected ${result.code}: ${result.message}`)
      }
      expect(result).toBeInstanceOf(AggregateError)
      now.value += PAIRING_REPLAY_RETENTION_MS
    }
    expect(blockedChallenge).toBeDefined()
    const retainedAllocationCount = handshake.completeChallenge.mock.calls.length

    now.value += PAIRING_REPLAY_RETENTION_MS * 3
    const stillBlockedChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('orphan-capacity-still-blocked'),
    })
    await expect(provider.completeChallenge({
      mobile,
      completionId: parsePairingCompletionId('orphan-capacity-still-blocked'),
      oneTimeLink: stillBlockedChallenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))
    expect(handshake.completeChallenge).toHaveBeenCalledTimes(retainedAllocationCount)

    invalidPendingId = false
    const isolatedChallenge = await provider.createChallenge({
      desktop: otherDesktop,
      rendezvousId: parsePairingRendezvousId('orphan-capacity-isolated'),
    })
    await expect(completeAs(
      provider,
      isolatedChallenge.oneTimeLink,
      'orphan-capacity-isolated',
      'other-mobile',
      'account-one',
    )).resolves.toBeDefined()
    handshake.destroyPendingPairing.mockResolvedValue(undefined)
    await provider.setMobileAccess({ desktop: otherDesktop, enabled: false })
    handshake.destroyPendingPairing.mockRejectedValue(new Error('pending cleanup unavailable'))
    await expect(provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('orphan-capacity-cross-owner-cleanup'),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_RESOURCE_LIMIT' }))

    handshake.destroyPendingPairing.mockResolvedValue(undefined)
    await provider.setMobileAccess({ desktop, enabled: false })
    await provider.setMobileAccess({ desktop, enabled: true })
    await expect(provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('orphan-capacity-released'),
    })).resolves.toBeDefined()
  })

  it('retries cleanup tombstones without repeating handshake or activation', async () => {
    const handshake = handshakeProvider()
    handshake.destroyChallenge.mockRejectedValueOnce(new Error('challenge cleanup failed'))
    handshake.destroyPendingPairing.mockRejectedValueOnce(new Error('pending cleanup failed'))
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('cleanup-retry'),
    })
    const input = {
      mobile: authentication('mobile-installation'),
      completionId: parsePairingCompletionId('completion-cleanup-retry'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' as const },
      mobileHandshake: Uint8Array.of(9),
    }

    await expect(provider.completeChallenge(input)).rejects.toThrow('challenge cleanup failed')
    const pending = await provider.completeChallenge(input)
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
    expect(handshake.destroyChallenge).toHaveBeenCalledTimes(2)

    await expect(provider.confirmPairing({
      desktop,
      pendingPairingId: pending.pendingPairingId,
    })).rejects.toThrow('pending cleanup failed')
    await expect(provider.confirmPairing({
      desktop,
      pendingPairingId: pending.pendingPairingId,
    })).resolves.toBeDefined()
    expect(handshake.activatePairing).toHaveBeenCalledOnce()
    expect(handshake.destroyPendingPairing).toHaveBeenCalledTimes(2)
  })

  it('settles cancellation and rejection before retryable cleanup', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const cancelled = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('cancel-cleanup'),
    })
    handshake.destroyChallenge.mockRejectedValueOnce(new Error('cancel cleanup failed'))
    const cancellations = await Promise.allSettled([
      provider.cancelChallenge({ desktop, challengeId: cancelled.challengeId }),
      provider.cancelChallenge({ desktop, challengeId: cancelled.challengeId }),
    ])
    expect(cancellations.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])

    const challenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('reject-cleanup'),
    })
    const pending = await complete(provider, challenge.oneTimeLink, 'reject-cleanup')
    handshake.destroyPendingPairing.mockRejectedValueOnce(new Error('reject cleanup failed'))
    const rejections = await Promise.allSettled([
      provider.rejectPairing({ desktop, pendingPairingId: pending.pendingPairingId }),
      provider.rejectPairing({ desktop, pendingPairingId: pending.pendingPairingId }),
    ])
    expect(rejections.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
  })

  it('eagerly expires challenges while instance disposal preserves active pairing authority', async () => {
    const scheduled: Array<() => void> = []
    const now = { value: NOW }
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake, now, (task) => {
      scheduled.push(task)
      return { unref: vi.fn() } as never
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('eager-expiry') })
    now.value += PAIRING_CHALLENGE_TTL_MS
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(handshake.destroyChallenge).toHaveBeenCalledOnce() })

    const pendingChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('dispose-pending'),
    })
    const pending = await complete(provider, pendingChallenge.oneTimeLink, 'dispose-pending')
    const activeChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('dispose-active'),
    })
    const livePendingChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('dispose-live-pending'),
    })
    await complete(provider, livePendingChallenge.oneTimeLink, 'dispose-live-pending')
    expect(activeChallenge).toBeDefined()
    await provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId })
    handshake.destroyChallenge.mockRejectedValueOnce(new Error('dispose challenge failed'))
    await expect(provider.dispose()).rejects.toThrow('Personal Pairing resource cleanup failed')
    expect(handshake.destroyChallenge).toHaveBeenCalled()
    expect(handshake.destroyPairing).not.toHaveBeenCalled()
    await expect(provider.dispose()).resolves.toBeUndefined()
  })

  it('runs lifecycle disposal and retries an orphaned pending-key cleanup', async () => {
    const ctx = new Context()
    const handshake = handshakeProvider()
    const provider = new PersonalPairingProvider(ctx, {
      account: { currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)) },
      handshake,
      clock: { now: () => NOW },
      randomBytes: size => new Uint8Array(size),
      randomId: kind => kind === 'challenge' ? crypto.randomUUID() : `${kind}-collision`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const first = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('orphan-first') })
    await complete(provider, first.oneTimeLink, 'orphan-first')
    const second = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('orphan-second') })
    handshake.destroyPendingPairing.mockRejectedValueOnce(new Error('orphan cleanup failed'))
    await expect(complete(provider, second.oneTimeLink, 'orphan-second')).rejects.toThrow(AggregateError)

    await ctx.fiber.dispose()
    expect(handshake.destroyPendingPairing).toHaveBeenCalledTimes(3)
  })

  it('fails loud on a generated pending id collision without leaking its pending key', async () => {
    const handshake = handshakeProvider()
    const provider = new PersonalPairingProvider(new Context(), {
      account: { currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)) },
      handshake,
      clock: { now: () => NOW },
      randomBytes: size => new Uint8Array(size),
      randomId: kind => kind === 'challenge' ? crypto.randomUUID() : `${kind}-collision`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const firstChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('first') })
    const firstPending = await complete(provider, firstChallenge.oneTimeLink, 'first-collision')
    const secondChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('second') })
    await expect(complete(provider, secondChallenge.oneTimeLink, 'second-collision'))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))
    expect(handshake.destroyPendingPairing).toHaveBeenCalledOnce()

    await provider.confirmPairing({ desktop, pendingPairingId: firstPending.pendingPairingId })
    expect(handshake.destroyPendingPairing).toHaveBeenCalledTimes(2)
  })

  it('rolls back only the new activation when its public key reference collides', async () => {
    const handshake = handshakeProvider()
    const firstActivation = Uint8Array.of(31)
    const collidingActivation = Uint8Array.of(32)
    handshake.activatePairing
      .mockResolvedValueOnce({ keyReference: 'key-shared' as never, activePairingKey: firstActivation })
      .mockResolvedValueOnce({ keyReference: 'key-shared' as never, activePairingKey: collidingActivation })
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })

    const firstChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('first-key-reference'),
    })
    const firstPending = await complete(provider, firstChallenge.oneTimeLink, 'first-key-reference')
    const firstPairing = await provider.confirmPairing({ desktop, pendingPairingId: firstPending.pendingPairingId })
    const secondChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('second-key-reference'),
    })
    const secondPending = await complete(provider, secondChallenge.oneTimeLink, 'second-key-reference')

    await expect(provider.confirmPairing({ desktop, pendingPairingId: secondPending.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))

    expect(handshake.destroyPairing).toHaveBeenCalledOnce()
    expect(handshake.destroyPairing).toHaveBeenCalledWith(collidingActivation)
    expect(await provider.listPersonalPairings(desktop)).toEqual([firstPairing])
    expect(firstPairing.devicePrincipal.authority).toBe('companion-surface')

    await provider.dispose()
    expect(handshake.destroyPairing).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      label: 'public key reference parse',
      configure: (handshake: ReturnType<typeof handshakeProvider>) => {
        handshake.activatePairing.mockResolvedValueOnce({
          keyReference: '' as never,
          activePairingKey: Uint8Array.of(41),
        })
      },
      expected: 'must be non-empty',
    },
    {
      label: 'random id source',
      configure: (_handshake: ReturnType<typeof handshakeProvider>) => {},
      expected: 'random id unavailable',
    },
  ])('destroys the new activation handle when $label fails', async ({ label, configure, expected }) => {
    const handshake = handshakeProvider()
    configure(handshake)
    let id = 0
    const provider = new PersonalPairingProvider(new Context(), {
      account: {
        currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
      },
      handshake,
      clock: { now: () => NOW },
      randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
      randomId: (kind) => {
        if (label === 'random id source' && kind === 'pairing') throw new Error('random id unavailable')
        return `${kind}-${String(++id)}`
      },
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({
      desktop, rendezvousId: parsePairingRendezvousId(`activation-${label}`),
    })
    const pending = await complete(provider, challenge.oneTimeLink, `activation-${label}`)

    await expect(provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId }))
      .rejects.toThrow(expected)
    expect(handshake.destroyPairing).toHaveBeenCalledOnce()
    expect(await provider.listPendingPairings(desktop)).toHaveLength(1)
  })

  it('retains a new activation handle when parse rollback cleanup fails and retries it on disposal', async () => {
    const handshake = handshakeProvider()
    handshake.activatePairing.mockResolvedValueOnce({
      keyReference: '' as never,
      activePairingKey: Uint8Array.of(42),
    })
    handshake.destroyPairing.mockRejectedValueOnce(new Error('activation cleanup unavailable'))
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('activation-cleanup-retry'),
    })
    const pending = await complete(provider, challenge.oneTimeLink, 'activation-cleanup-retry')

    await expect(provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId }))
      .rejects.toThrow('Personal Pairing activation rollback failed')
    expect(await provider.listPendingPairings(desktop)).toHaveLength(1)
    await expect(provider.dispose()).resolves.toBeUndefined()
    expect(handshake.destroyPairing).toHaveBeenCalledTimes(2)
    expect(handshake.destroyPairing).toHaveBeenNthCalledWith(1, Uint8Array.of(42))
    expect(handshake.destroyPairing).toHaveBeenNthCalledWith(2, Uint8Array.of(42))
  })

  it.each([
    { label: 'pairing', pairingIds: ['pairing-same', 'pairing-same'], principalIds: ['principal-one', 'principal-two'] },
    { label: 'principal', pairingIds: ['pairing-one', 'pairing-two'], principalIds: ['principal-same', 'principal-same'] },
  ])('retains retryable cleanup after a generated $label id collision', async ({ pairingIds, principalIds }) => {
    const handshake = handshakeProvider()
    handshake.activatePairing
      .mockResolvedValueOnce({ keyReference: 'key-one' as never, activePairingKey: Uint8Array.of(1) })
      .mockResolvedValueOnce({ keyReference: 'key-two' as never, activePairingKey: Uint8Array.of(2) })
    const provider = collisionPairingProvider(handshake, pairingIds, principalIds)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })

    const firstChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('first-generated-collision'),
    })
    const first = await complete(provider, firstChallenge.oneTimeLink, 'first-generated-collision')
    await provider.confirmPairing({ desktop, pendingPairingId: first.pendingPairingId })

    const secondChallenge = await provider.createChallenge({
      desktop,
      rendezvousId: parsePairingRendezvousId('second-generated-collision'),
    })
    const second = await complete(provider, secondChallenge.oneTimeLink, 'second-generated-collision')
    handshake.destroyPairing.mockRejectedValueOnce(new Error('active collision cleanup failed'))
    await expect(provider.confirmPairing({ desktop, pendingPairingId: second.pendingPairingId }))
      .rejects.toThrow(AggregateError)
    await expect(provider.confirmPairing({ desktop, pendingPairingId: second.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))

    expect(handshake.activatePairing).toHaveBeenCalledTimes(2)
    expect(handshake.destroyPendingPairing).toHaveBeenCalledTimes(2)
    expect(handshake.destroyPairing).toHaveBeenCalledTimes(2)
  })

  it('reports a generated pairing identity collision after successful cleanup', async () => {
    const handshake = handshakeProvider()
    handshake.activatePairing
      .mockResolvedValueOnce({ keyReference: 'key-one' as never, activePairingKey: Uint8Array.of(1) })
      .mockResolvedValueOnce({ keyReference: 'key-two' as never, activePairingKey: Uint8Array.of(2) })
    const provider = collisionPairingProvider(
      handshake,
      ['pairing-same', 'pairing-same'],
      ['principal-one', 'principal-two'],
    )
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const firstChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('direct-first') })
    const first = await complete(provider, firstChallenge.oneTimeLink, 'direct-first')
    await provider.confirmPairing({ desktop, pendingPairingId: first.pendingPairingId })
    const secondChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('direct-second') })
    const second = await complete(provider, secondChallenge.oneTimeLink, 'direct-second')
    await expect(provider.confirmPairing({ desktop, pendingPairingId: second.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))
  })

  it('rejects a completion id collision before starting another handshake', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const first = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('first') })
    const second = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('second') })
    const completionId = parsePairingCompletionId('completion-collision')
    await provider.completeChallenge({
      mobile: authentication('mobile-installation'), completionId, oneTimeLink: first.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' }, mobileHandshake: Uint8Array.of(9),
    })
    await expect(provider.completeChallenge({
      mobile: authentication('mobile-installation'), completionId, oneTimeLink: second.oneTimeLink,
      device: { name: 'Alice phone', platform: 'ios' }, mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))
    expect(handshake.completeChallenge).toHaveBeenCalledOnce()
  })

  it('retries an eager-expiry cleanup tombstone through the expired invitation', async () => {
    const scheduled: Array<() => void> = []
    const now = { value: NOW }
    const handshake = handshakeProvider()
    handshake.destroyChallenge.mockRejectedValueOnce(new Error('expiry cleanup failed'))
    const provider = uniquePairingProvider(handshake, now, (task) => {
      scheduled.push(task)
      return { unref: vi.fn() } as never
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('expiry-retry') })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    now.value += PAIRING_CHALLENGE_TTL_MS
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(handshake.destroyChallenge).toHaveBeenCalledOnce() })
    await expect(complete(provider, challenge.oneTimeLink, 'expiry-retry'))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_EXPIRED' }))
    expect(handshake.destroyChallenge).toHaveBeenCalledTimes(2)
    errorLog.mockRestore()
  })

  it('does not recreate an invitation after Mobile Access is concurrently disabled', async () => {
    const handshake = handshakeProvider()
    const created = deferred<Awaited<ReturnType<PairingHandshakeProvider['createChallenge']>>>()
    handshake.createChallenge.mockReturnValueOnce(created.promise)
    const provider = pairingProvider(handshake)
    const desktop = authentication('desktop-installation', 'account-one')
    await provider.setMobileAccess({ desktop, enabled: true })

    const creating = provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('concurrent-disable') })
    await vi.waitFor(() => { expect(handshake.createChallenge).toHaveBeenCalledOnce() })
    let disabled = false
    const disabling = provider.setMobileAccess({ desktop, enabled: false }).then((state) => {
      disabled = true
      return state
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(disabled).toBe(false)
    created.resolve({ desktopFingerprint: 'desktop-fingerprint', state: Uint8Array.of(1) })
    const challenge = await creating
    await disabling

    await expect(complete(provider, challenge.oneTimeLink, 'disabled-after-create')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }),
    )
    expect(handshake.destroyChallenge).toHaveBeenCalledOnce()
  })

  it('fails closed on invalid provider output and uses secure production defaults', async () => {
    const handshake = handshakeProvider()
    expect(() => new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake,
      pairingLinkOrigin: 'http://platform.example.com/pair',
    })).toThrow('must use HTTPS')

    const defaults = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    const desktop = authentication('desktop-installation')
    await defaults.setMobileAccess({ desktop, enabled: true })
    const challenge = await defaults.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('defaults') })
    expect(parsePairingInvitationLink(challenge.oneTimeLink).invitationSecret).toHaveLength(32)
    expect(challenge.challengeId).toMatch(/^challenge-/u)

    const badRandom = new PersonalPairingProvider(new Context(), {
      account: accountService(account('account-one')),
      handshake,
      randomBytes: () => Uint8Array.of(1),
      pairingLinkOrigin: 'https://platform.example.com/pair',
    })
    await badRandom.setMobileAccess({ desktop, enabled: true })
    await expect(badRandom.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('bad-random') }))
      .rejects.toThrow('must return 32 bytes')

    handshake.createChallenge.mockResolvedValueOnce({ desktopFingerprint: '', state: Uint8Array.of(2) })
    await expect(defaults.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('bad-fingerprint') }))
      .rejects.toThrow('Desktop fingerprint must be non-empty')
    expect(handshake.destroyChallenge).toHaveBeenCalledWith(Uint8Array.of(2))

    const collisionHandshake = handshakeProvider()
    const collision = pairingProvider(collisionHandshake)
    await collision.setMobileAccess({ desktop, enabled: true })
    await collision.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('first-id') })
    await expect(collision.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('reused-id') }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))
    expect(collisionHandshake.destroyChallenge).toHaveBeenCalledOnce()
  })

  it('disables only the owning Desktop capabilities and rejects cross-owner retries', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktopOne = authentication('desktop-one', 'account-one')
    const desktopTwo = authentication('desktop-two', 'account-one')
    await provider.setMobileAccess({ desktop: desktopOne, enabled: true })
    await provider.setMobileAccess({ desktop: desktopTwo, enabled: true })

    const challengeOne = await provider.createChallenge({ desktop: desktopOne, rendezvousId: parsePairingRendezvousId('one') })
    const pendingOne = await completeAs(provider, challengeOne.oneTimeLink, 'one', 'mobile-one', 'account-one')
    const challengeTwo = await provider.createChallenge({ desktop: desktopTwo, rendezvousId: parsePairingRendezvousId('two') })
    const pendingTwo = await completeAs(provider, challengeTwo.oneTimeLink, 'two', 'mobile-two', 'account-one')
    const settledTwoChallenge = await provider.createChallenge({
      desktop: desktopTwo, rendezvousId: parsePairingRendezvousId('settled-two'),
    })
    const settledTwo = await completeAs(provider, settledTwoChallenge.oneTimeLink, 'settled-two', 'mobile-four', 'account-one')
    await provider.rejectPairing({ desktop: desktopTwo, pendingPairingId: settledTwo.pendingPairingId })
    const activeOne = await provider.createChallenge({ desktop: desktopOne, rendezvousId: parsePairingRendezvousId('active-one') })
    const activeTwo = await provider.createChallenge({ desktop: desktopTwo, rendezvousId: parsePairingRendezvousId('active-two') })

    await expect(provider.completeChallenge({
      mobile: authentication('other-mobile', 'account-one'),
      completionId: parsePairingCompletionId('completion-one'),
      oneTimeLink: challengeOne.oneTimeLink,
      device: { name: 'Other phone', platform: 'ios' },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_USED' }))

    expect(await provider.setMobileAccess({ desktop: desktopOne, enabled: false })).toEqual({ enabled: false })
    expect(await provider.listPendingPairings(desktopOne)).toEqual([])
    expect(await provider.listPendingPairings(desktopTwo)).toEqual([pendingTwo])
    await expect(completeAs(provider, activeOne.oneTimeLink, 'disabled', 'mobile-three', 'account-one'))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))
    await expect(provider.confirmPairing({ desktop: desktopOne, pendingPairingId: pendingOne.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))

    await expect(provider.cancelChallenge({ desktop: desktopOne, challengeId: activeTwo.challengeId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))
    await expect(provider.cancelChallenge({ desktop: authentication('desktop-two', 'account-two'), challengeId: activeTwo.challengeId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))
    await expect(provider.cancelChallenge({ desktop: desktopOne, challengeId: parsePairingChallengeId('missing') }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))

    await expect(provider.rejectPairing({ desktop: desktopOne, pendingPairingId: pendingTwo.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
    await expect(provider.rejectPairing({
      desktop: authentication('desktop-two', 'account-two'), pendingPairingId: pendingTwo.pendingPairingId,
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
    await expect(provider.rejectPairing({ desktop: desktopOne, pendingPairingId: parsePendingPairingId('missing') }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
    await provider.rejectPairing({ desktop: desktopTwo, pendingPairingId: pendingTwo.pendingPairingId })
    await provider.cancelChallenge({ desktop: desktopTwo, challengeId: activeTwo.challengeId })
  })

  it('rejects mismatched invitations and terminal actions owned by another state or Installation', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-one')
    const otherDesktop = authentication('desktop-two')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('mismatch') })
    const changed = new URL(challenge.oneTimeLink)
    changed.searchParams.set('rendezvous', 'different')
    changed.searchParams.set('secret', 'A'.repeat(43))
    expect(parsePairingInvitationLink(changed.toString())).toMatchObject({
      challengeId: challenge.challengeId,
      rendezvousId: 'different',
    })
    const mismatch = await complete(provider, changed.toString(), 'mismatch').catch((error: unknown) => error)
    expect(mismatch).toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))

    const missing = new URL(challenge.oneTimeLink)
    missing.searchParams.set('challenge', 'missing')
    await expect(complete(provider, missing.toString(), 'missing'))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))

    const cancelled = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('cancel-owner') })
    await provider.cancelChallenge({ desktop, challengeId: cancelled.challengeId })
    await expect(provider.cancelChallenge({ desktop: otherDesktop, challengeId: cancelled.challengeId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))

    const used = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('used-terminal') })
    const confirmed = await complete(provider, used.oneTimeLink, 'used-terminal')
    await provider.confirmPairing({ desktop, pendingPairingId: confirmed.pendingPairingId })
    await expect(provider.cancelChallenge({ desktop, challengeId: used.challengeId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_CHALLENGE_INVALID' }))
    await expect(provider.rejectPairing({ desktop, pendingPairingId: confirmed.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))

    const rejected = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('reject-owner') })
    const rejectedPending = await complete(provider, rejected.oneTimeLink, 'reject-owner')
    await provider.rejectPairing({ desktop, pendingPairingId: rejectedPending.pendingPairingId })
    await expect(provider.rejectPairing({ desktop: otherDesktop, pendingPairingId: rejectedPending.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_PENDING_INVALID' }))
  })

  it('ignores an expiry timer that fires before its deadline', async () => {
    const scheduled: Array<() => void> = []
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake, { value: NOW }, (task) => {
      scheduled.push(task)
      return { unref: vi.fn() } as never
    })
    const desktop = authentication('desktop-installation')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('early-timer') })
    scheduled[0]?.()
    await Promise.resolve()
    expect(handshake.destroyChallenge).not.toHaveBeenCalled()
    await provider.cancelChallenge({ desktop, challengeId: challenge.challengeId })
  })

  it('rejects reused pairing keys and hides active pairings from other Desktops', async () => {
    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-one')
    await provider.setMobileAccess({ desktop, enabled: true })

    const firstChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('first') })
    const firstPending = await completeAs(provider, firstChallenge.oneTimeLink, 'first', 'mobile-one', 'account-one')
    await provider.confirmPairing({ desktop, pendingPairingId: firstPending.pendingPairingId })
    expect(await provider.listPersonalPairings(authentication('desktop-two'))).toEqual([])

    const secondChallenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('second') })
    const secondPending = await completeAs(provider, secondChallenge.oneTimeLink, 'second', 'mobile-two', 'account-one')
    await expect(provider.confirmPairing({ desktop, pendingPairingId: secondPending.pendingPairingId }))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteAccessError>>({ code: 'PAIRING_ID_COLLISION' }))
    expect(handshake.destroyPairing).toHaveBeenCalledOnce()
  })

  it('parses every branded id and rejects malformed invitation wire values', async () => {
    expect(parsePairingChallengeId('challenge')).toBe('challenge')
    expect(parsePairingCompletionId('completion')).toBe('completion')
    expect(parsePairingRendezvousId('rendezvous')).toBe('rendezvous')
    expect(parsePendingPairingId('pending')).toBe('pending')
    expect(parseDevicePrincipalId('principal')).toBe('principal')
    expect(parsePersonalPairingId('pairing')).toBe('pairing')
    expect(() => parsePairingChallengeId(undefined)).toThrow('must be non-empty')
    expect(() => parsePairingChallengeId(' ')).toThrow('must be non-empty')
    expect(() => deriveAuthenticationWords(Uint8Array.of(1))).toThrow('at least 32 bytes')

    const handshake = handshakeProvider()
    const provider = uniquePairingProvider(handshake)
    const desktop = authentication('desktop-one')
    await provider.setMobileAccess({ desktop, enabled: true })
    const challenge = await provider.createChallenge({ desktop, rendezvousId: parsePairingRendezvousId('wire') })
    const valid = new URL(challenge.oneTimeLink)
    const invalidLinks = [
      'http' + challenge.oneTimeLink.slice('https'.length),
      mutateLink(valid, (url) => { url.searchParams.delete('challenge') }),
      mutateLink(valid, (url) => { url.searchParams.append('challenge', 'duplicate') }),
      mutateLink(valid, (url) => { url.searchParams.set('secret', 'AA') }),
      mutateLink(valid, (url) => { url.searchParams.set('secret', '*') }),
      mutateLink(valid, (url) => { url.searchParams.set('secret', 'A') }),
      mutateLink(valid, (url) => { url.searchParams.set('secret', 'AB') }),
      mutateLink(valid, (url) => { url.searchParams.set('expires', '0') }),
      mutateLink(valid, (url) => { url.searchParams.set('expires', 'not-a-number') }),
      mutateLink(valid, (url) => { url.searchParams.set('protocol', '2') }),
    ]
    for (const link of invalidLinks) expect(() => parsePairingInvitationLink(link)).toThrow()

    await expect(provider.completeChallenge({
      mobile: authentication('mobile-one'),
      completionId: parsePairingCompletionId('bad-device'),
      oneTimeLink: challenge.oneTimeLink,
      device: { name: 'Phone', platform: 'windows' as never },
      mobileHandshake: Uint8Array.of(9),
    })).rejects.toThrow('platform must be ios or android')

    for (const [index, device] of ['phone', null, []].entries()) {
      const next = await provider.createChallenge({
        desktop,
        rendezvousId: parsePairingRendezvousId(`bad-device-${String(index)}`),
      })
      await expect(provider.completeChallenge({
        mobile: authentication('mobile-one'),
        completionId: parsePairingCompletionId(`bad-device-object-${String(index)}`),
        oneTimeLink: next.oneTimeLink,
        device: device as never,
        mobileHandshake: Uint8Array.of(9),
      })).rejects.toThrow('Pairing device must be an object')
    }
    expect(handshake.destroyPendingPairing).toHaveBeenCalledTimes(4)
  })
})

function account(id: string): PlatformAccountView {
  return { id: id as never, githubId: 1, githubLogin: id, avatarUrl: 'https://avatars.example/account' }
}

function accountService(view: PlatformAccountView) {
  return {
    currentInstallation: vi.fn().mockResolvedValue({
      account: view,
      installation: { id: parseInstallationId('desktop-installation'), kind: 'desktop' },
    }),
  }
}

function authentication(
  installationId: string,
  accountId = 'account-one',
) {
  const proof: AccountProof = {
    jti: parseAccountProofJti(`${installationId}-proof`),
    issuedAt: NOW,
    signature: 'signature',
  }
  return {
    accessToken: `${accountId}:${installationId}-token`,
    proof,
  }
}

function handshakeProvider() {
  return {
    createChallenge: vi.fn().mockResolvedValue({
      desktopFingerprint: 'desktop-fingerprint',
      state: Uint8Array.of(1),
    }),
    completeChallenge: vi.fn().mockResolvedValue({
      handshakeHash: Uint8Array.from({ length: 32 }, (_, index) => index),
      desktopHandshake: Uint8Array.of(8),
      pendingPairingKey: Uint8Array.of(7),
    }),
    activatePairing: vi.fn().mockResolvedValue({
      keyReference: 'pairing-key-one',
      activePairingKey: Uint8Array.of(6),
    }),
    destroyChallenge: vi.fn(),
    destroyPendingPairing: vi.fn(),
    destroyPairing: vi.fn(),
  }
}

function pairingProvider(handshake: PairingHandshakeProvider, now = { value: NOW }) {
  return new PersonalPairingProvider(new Context(), {
    account: {
      currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
    },
    handshake,
    clock: { now: () => now.value },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-id`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
}

function complete(provider: PersonalPairingProvider, oneTimeLink: string, id: string) {
  return provider.completeChallenge({
    mobile: authentication('mobile-installation', 'account-one'),
    completionId: parsePairingCompletionId(`completion-${id}`),
    oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' },
    mobileHandshake: Uint8Array.of(9),
  })
}

function uniquePairingProvider(
  handshake: PairingHandshakeProvider,
  now = { value: NOW },
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>,
) {
  let id = 0
  return new PersonalPairingProvider(new Context(), {
    account: {
      currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
    },
    handshake,
    clock: { now: () => now.value },
    ...(schedule === undefined ? {} : { schedule }),
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
}

function collisionPairingProvider(
  handshake: PairingHandshakeProvider,
  pairingIds: string[],
  principalIds: string[],
) {
  let challenge = 0
  let pending = 0
  return new PersonalPairingProvider(new Context(), {
    account: {
      currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
    },
    handshake,
    clock: { now: () => NOW },
    randomBytes: size => new Uint8Array(size),
    randomId: (kind) => {
      if (kind === 'challenge') return `challenge-${String(++challenge)}`
      if (kind === 'completion') return `pending-${String(++pending)}`
      const values = kind === 'pairing' ? pairingIds : principalIds
      const value = values.shift()
      if (value === undefined) throw new Error(`Missing ${kind} test id`)
      return value
    },
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
}

function authenticated(accessToken: string) {
  const [accountId, installationToken] = accessToken.split(':') as [string, string]
  const installationId = installationToken.replace(/-token$/u, '')
  return {
    account: account(accountId),
    installation: {
      id: parseInstallationId(installationId),
      kind: installationId.includes('mobile') ? 'mobile' as const : 'desktop' as const,
    },
  }
}

function completeAs(
  provider: PersonalPairingProvider,
  oneTimeLink: string,
  id: string,
  mobileInstallationId: string,
  accountId: string,
) {
  return provider.completeChallenge({
    mobile: authentication(mobileInstallationId, accountId),
    completionId: parsePairingCompletionId(`completion-${id}`),
    oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' },
    mobileHandshake: Uint8Array.of(9),
  })
}

function mutateLink(source: URL, mutate: (url: URL) => void): string {
  const copy = new URL(source)
  mutate(copy)
  return copy.toString()
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}
