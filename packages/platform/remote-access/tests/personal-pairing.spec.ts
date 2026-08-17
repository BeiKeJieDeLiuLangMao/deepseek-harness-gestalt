import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { AccountProof, PlatformAccountView } from '@deepseek-ai/dsh-platform-account'
import { parseAccountProofJti, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import {
  PERSONAL_PAIRING_PROTOCOL_MAJOR,
  PAIRING_CHALLENGE_TTL_MS,
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
    expect(handshake.activatePairing).toHaveBeenCalledOnce()
    expect(handshake.destroyPendingPairing).toHaveBeenCalledOnce()
  })

  it('destroys expiry, cancellation, rejection, and successful-use capabilities', async () => {
    const now = { value: NOW }
    const handshake = handshakeProvider()
    const provider = pairingProvider(handshake, now)
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
      .rejects.toThrow('reused an active challenge id')
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
      .rejects.toThrow('reused a pairing key reference')
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
  return { current: vi.fn().mockResolvedValue(view) }
}

function authentication(installationId: string, accountId = 'account-one') {
  const proof: AccountProof = {
    jti: parseAccountProofJti(`${installationId}-proof`),
    issuedAt: NOW,
    signature: 'signature',
  }
  return {
    installationId: parseInstallationId(installationId),
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
    activatePairing: vi.fn().mockResolvedValue({ keyReference: 'pairing-key-one' }),
    destroyChallenge: vi.fn(),
    destroyPendingPairing: vi.fn(),
  }
}

function pairingProvider(handshake: PairingHandshakeProvider, now = { value: NOW }) {
  return new PersonalPairingProvider(new Context(), {
    account: {
      current: vi.fn(async ({ accessToken }: { accessToken: string }) => account(accessToken.split(':')[0] as string)),
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

function uniquePairingProvider(handshake: PairingHandshakeProvider) {
  let id = 0
  return new PersonalPairingProvider(new Context(), {
    account: {
      current: vi.fn(async ({ accessToken }: { accessToken: string }) => account(accessToken.split(':')[0] as string)),
    },
    handshake,
    clock: { now: () => NOW },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
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
