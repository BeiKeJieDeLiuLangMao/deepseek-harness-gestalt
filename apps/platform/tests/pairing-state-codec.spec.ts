import { parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseDevicePrincipalId,
  parsePairingChallengeId,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  parsePendingPairingId,
  parsePersonalPairingId,
  parsePersonalPairingKeyReference,
} from '@deepseek-ai/dsh-remote-access'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import { describe, expect, it } from 'vitest'
import {
  decodePairingTransactionState,
  emptyPairingTransactionState,
  encodePairingTransactionState,
} from '../src/pairing-state-codec.ts'

describe('pairing transaction codec', () => {
  it('round-trips empty state and rejects an invalid document', () => {
    const empty = emptyPairingTransactionState()
    expect(decodePairingTransactionState(encodePairingTransactionState(empty))).toEqual(empty)
    expect(decodePairingTransactionState(undefined).challenges.size).toBe(0)
    expect(() => decodePairingTransactionState('nope')).toThrow(/object/)
    expect(() => decodePairingTransactionState({
      ...encodePairingTransactionState(empty) as object,
      settledChallenges: [['id', { outcome: 'unknown' }]],
    })).toThrow(/outcome/)
  })

  it('preserves bytes, orphan cleanup identity, and quota windows', () => {
    const cleanup = { resource: Uint8Array.of(9, 8, 7) }
    const state = emptyPairingTransactionState()
    state.challenges.set(parsePairingChallengeId('challenge-one'), {
      invitation: {
        challengeId: parsePairingChallengeId('challenge-one'),
        invitationSecret: Uint8Array.from({ length: 32 }, (_, index) => index),
        desktopFingerprint: 'fp',
        desktopStaticPublicKey: new Uint8Array(32).fill(7),
        rendezvousId: parsePairingRendezvousId('rendezvous-one'),
        expiresAt: 1_787_027_200_000,
        protocolMajor: 1,
      },
      accountId: 'account-one',
      desktopInstallationId: parseInstallationId('desktop-one'),
      cleanup,
    })
    state.orphanPendingCleanups.set(cleanup, {
      accountId: 'account-one',
      desktopInstallationId: parseInstallationId('desktop-one'),
      mobileInstallationId: parseInstallationId('mobile-one'),
      cleanup,
    })
    state.accountChallengeAt.set('account-one', [10, 20])
    state.blobs.set('blob-1', { accountId: 'account-one', bytes: 32 })
    state.blobSequence.next = 4
    const decoded = decodePairingTransactionState(
      JSON.parse(JSON.stringify(encodePairingTransactionState(state))) as unknown,
    )
    const challenge = decoded.challenges.get(parsePairingChallengeId('challenge-one'))
    expect(challenge?.invitation.invitationSecret).toEqual(Uint8Array.from({ length: 32 }, (_, index) => index))
    expect(challenge?.invitation.desktopStaticPublicKey).toEqual(new Uint8Array(32).fill(7))
    const [orphanCleanup, orphan] = [...decoded.orphanPendingCleanups][0] ?? []
    expect(orphanCleanup).toBe(orphan?.cleanup)
    expect(decoded.accountChallengeAt.get('account-one')).toEqual([10, 20])
    expect(decoded.blobSequence.next).toBe(4)
  })

  it('persists only opaque endpoint mailbox messages and never Desktop private state', () => {
    const state = emptyPairingTransactionState()
    const desktopPrivateSentinel = Uint8Array.from({ length: 32 }, () => 213)
    state.endpointMailbox = {
      challenges: [{
        challengeId: parsePairingChallengeId('challenge-mailbox'),
        accountId: parsePlatformAccountId('account-one'),
        desktopInstallationId: parseInstallationId('desktop-one'),
        expiresAt: 1_787_027_200_000,
        invitationPayload: Uint8Array.of(1, 2, 3),
        completionId: parsePairingCompletionId('completion-mailbox'),
        pendingPairingId: parsePendingPairingId('pending-mailbox'),
      }],
      pending: [{
        pendingPairingId: parsePendingPairingId('pending-mailbox'),
        completionId: parsePairingCompletionId('completion-mailbox'),
        challengeId: parsePairingChallengeId('challenge-mailbox'),
        accountId: parsePlatformAccountId('account-one'),
        desktopInstallationId: parseInstallationId('desktop-one'),
        mobileInstallationId: parseInstallationId('mobile-one'),
        device: { name: 'Alice phone', platform: 'ios' },
        message1: Uint8Array.of(11),
        message2: Uint8Array.of(22),
        message3: Uint8Array.of(33),
        confirmed: true,
        rejected: false,
        pairingId: parsePersonalPairingId('pairing-mailbox'),
        sealedRelayAuthority: Uint8Array.of(44),
      }],
    }
    const encoded = encodePairingTransactionState(state)
    expect(JSON.stringify(encoded)).not.toContain(Buffer.from(desktopPrivateSentinel).toString('base64url'))
    expect(decodePairingTransactionState(encoded).endpointMailbox).toEqual(state.endpointMailbox)
  })

  it('round-trips a confirmed pairing and Relay grant', () => {
    const state = emptyPairingTransactionState()
    state.pairings.set(parsePersonalPairingId('pairing-one'), {
      id: parsePersonalPairingId('pairing-one'),
      devicePrincipal: {
        id: parseDevicePrincipalId('principal-one'),
        accountId: parsePlatformAccountId('account-one'),
        installationId: parseInstallationId('mobile-one'),
        authority: 'companion-surface',
      },
      device: { name: 'Phone', platform: 'ios' },
      pairedAt: 2,
      lastAccessAt: 3,
      online: false,
      desktopInstallationId: parseInstallationId('desktop-one'),
      keyReference: parsePersonalPairingKeyReference('key-one'),
      cleanup: { resource: Uint8Array.of(1) },
      mobileGrant: {
        routeId: parseRelayRouteId('route-one'),
        endpoint: 'mobile',
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        revision: 2,
      },
    })
    state.completions.set(parsePairingCompletionId('completion-one'), {
      accountId: 'account-one',
      desktopInstallationId: parseInstallationId('desktop-one'),
      mobileInstallationId: parseInstallationId('mobile-one'),
      challengeId: parsePairingChallengeId('challenge-one'),
      challengeCleanup: {},
      view: {
        pendingPairingId: parsePendingPairingId('pending-one'),
        authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
        desktopHandshake: Uint8Array.of(4, 5),
        device: { name: 'Phone', platform: 'android' },
      },
      completedAt: 9,
    })
    const completion = state.completions.get(parsePairingCompletionId('completion-one'))
    if (completion === undefined) throw new Error('pairing codec fixture requires a completion')
    state.pending.set(parsePendingPairingId('pending-one'), {
      ...completion,
      cleanup: { resource: Uint8Array.of(6) },
      awaitingFinish: true,
      finishDigest: new Uint8Array(32).fill(8),
    })
    const decoded = decodePairingTransactionState(encodePairingTransactionState(state))
    expect(decoded.pairings.get(parsePersonalPairingId('pairing-one'))?.mobileGrant?.revision).toBe(2)
    expect(decoded.completions.get(parsePairingCompletionId('completion-one'))?.view.device.platform).toBe('android')
    expect(decoded.pending.get(parsePendingPairingId('pending-one'))).toMatchObject({
      awaitingFinish: true,
      finishDigest: new Uint8Array(32).fill(8),
    })
  })
})
