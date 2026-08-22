import { describe, expect, it } from 'vitest'
import { parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  EndpointOwnedPairingMailbox,
  parsePairingChallengeId,
  parsePairingCompletionId,
  parsePendingPairingId,
  parsePersonalPairingId,
} from '../src/index.ts'

const ACCOUNT = parsePlatformAccountId('account-one')
const OTHER_ACCOUNT = parsePlatformAccountId('account-two')
const DESKTOP = parseInstallationId('desktop-one')
const MOBILE = parseInstallationId('mobile-one')
const CHALLENGE = parsePairingChallengeId('challenge-one')
const COMPLETION = parsePairingCompletionId('completion-one')
const PENDING = parsePendingPairingId('pending-one')
const PAIRING = parsePersonalPairingId('pairing-one')
const DEVICE = { name: 'Alice phone', platform: 'ios' as const }

describe('EndpointOwnedPairingMailbox', () => {
  it('forwards opaque XKpsk3 messages in order without retaining Desktop private state', () => {
    const mailbox = fixture()
    const desktopPrivateSentinel = Uint8Array.from({ length: 32 }, () => 213)
    mailbox.createChallenge({
      challengeId: CHALLENGE, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      expiresAt: 2_000,
    })
    expect(mailbox.submitMessage1({
      challengeId: CHALLENGE, completionId: COMPLETION, accountId: ACCOUNT,
      mobileInstallationId: MOBILE, device: DEVICE, message1: Uint8Array.of(11), now: 1_000,
    })).toEqual({ pendingPairingId: PENDING })
    expect(mailbox.readDesktop(PENDING, ACCOUNT, DESKTOP)).toMatchObject({
      stage: 'message1', message1: Uint8Array.of(11),
    })
    mailbox.submitMessage2({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      message2: Uint8Array.of(22),
    })
    expect(mailbox.readMobile(COMPLETION, ACCOUNT, MOBILE)).toMatchObject({
      stage: 'message2', message2: Uint8Array.of(22),
    })
    mailbox.submitMessage3({
      completionId: COMPLETION, accountId: ACCOUNT, mobileInstallationId: MOBILE,
      message3: Uint8Array.of(33),
    })
    expect(mailbox.readDesktop(PENDING, ACCOUNT, DESKTOP)).toMatchObject({
      stage: 'message3', message3: Uint8Array.of(33),
    })
    expect(JSON.stringify(mailbox.exportState())).not.toContain(JSON.stringify([...desktopPrivateSentinel]))
  })

  it('rejects wrong-account reads and message submission', () => {
    const mailbox = completedMessage1()
    expect(() => mailbox.readDesktop(PENDING, OTHER_ACCOUNT, DESKTOP)).toThrow('account')
    expect(() => mailbox.submitMessage2({
      pendingPairingId: PENDING, accountId: OTHER_ACCOUNT, desktopInstallationId: DESKTOP,
      message2: Uint8Array.of(22),
    })).toThrow('account')
    expect(() => mailbox.readMobile(COMPLETION, OTHER_ACCOUNT, MOBILE)).toThrow('account')
  })

  it('rejects expired challenges and a second completion identity', () => {
    const mailbox = fixture()
    mailbox.createChallenge({
      challengeId: CHALLENGE, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      expiresAt: 1_000,
    })
    expect(() => mailbox.submitMessage1({
      challengeId: CHALLENGE, completionId: COMPLETION, accountId: ACCOUNT,
      mobileInstallationId: MOBILE, device: DEVICE, message1: Uint8Array.of(11), now: 1_001,
    })).toThrow('expired')

    const active = completedMessage1()
    expect(() => active.submitMessage1({
      challengeId: CHALLENGE, completionId: parsePairingCompletionId('completion-other'),
      accountId: ACCOUNT, mobileInstallationId: MOBILE, device: DEVICE,
      message1: Uint8Array.of(11), now: 1_000,
    })).toThrow('used')
  })

  it('rejects message 3 and confirmation before their preceding mailbox stage', () => {
    const mailbox = completedMessage1()
    expect(() => mailbox.submitMessage3({
      completionId: COMPLETION, accountId: ACCOUNT, mobileInstallationId: MOBILE,
      message3: Uint8Array.of(33),
    })).toThrow('message 2')
    expect(() => { mailbox.confirm({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP, pairingId: PAIRING,
    }) }).toThrow('message 3')
  })

  it('makes lost successful message responses idempotent and rejects a changed replay', () => {
    const mailbox = completedMessage1()
    const message2 = {
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      message2: Uint8Array.of(22),
    }
    expect(mailbox.submitMessage2(message2)).toEqual({ completionId: COMPLETION })
    expect(mailbox.submitMessage2(message2)).toEqual({ completionId: COMPLETION })
    expect(() => mailbox.submitMessage2({ ...message2, message2: Uint8Array.of(23) })).toThrow('stale')
    const message3 = {
      completionId: COMPLETION, accountId: ACCOUNT, mobileInstallationId: MOBILE,
      message3: Uint8Array.of(33),
    }
    expect(mailbox.submitMessage3(message3)).toEqual({ pendingPairingId: PENDING })
    expect(mailbox.submitMessage3(message3)).toEqual({ pendingPairingId: PENDING })
    expect(() => mailbox.submitMessage3({ ...message3, message3: Uint8Array.of(34) })).toThrow('stale')
  })

  it('delivers one sealed Relay authority only after Desktop confirmation', () => {
    const mailbox = completedMessage1()
    mailbox.submitMessage2({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      message2: Uint8Array.of(22),
    })
    mailbox.submitMessage3({
      completionId: COMPLETION, accountId: ACCOUNT, mobileInstallationId: MOBILE,
      message3: Uint8Array.of(33),
    })
    mailbox.confirm({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP, pairingId: PAIRING,
    })
    const sealedRelayAuthority = Uint8Array.of(91, 92, 93)
    mailbox.deliverSealedAuthority({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      sealedRelayAuthority,
    })
    expect(mailbox.readMobile(COMPLETION, ACCOUNT, MOBILE)).toEqual({
      stage: 'confirmed', pendingPairingId: PENDING, pairingId: PAIRING, sealedRelayAuthority,
    })
  })

  it('cancels unused invitations and projects Desktop rejection to Mobile', () => {
    const cancelled = fixture()
    cancelled.createChallenge({
      challengeId: CHALLENGE, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
      expiresAt: 2_000,
    })
    cancelled.cancelChallenge(CHALLENGE, ACCOUNT, DESKTOP)
    expect(() => cancelled.submitMessage1({
      challengeId: CHALLENGE, completionId: COMPLETION, accountId: ACCOUNT,
      mobileInstallationId: MOBILE, device: DEVICE, message1: Uint8Array.of(1), now: 1_000,
    })).toThrow('invalid')

    const rejected = completedMessage1()
    rejected.reject({ pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP })
    expect(rejected.readMobile(COMPLETION, ACCOUNT, MOBILE)).toEqual({
      stage: 'rejected', pendingPairingId: PENDING,
    })
    expect(() => { rejected.confirm({
      pendingPairingId: PENDING, accountId: ACCOUNT, desktopInstallationId: DESKTOP, pairingId: PAIRING,
    }) }).toThrow('message 3')
  })
})

function fixture(): EndpointOwnedPairingMailbox {
  return new EndpointOwnedPairingMailbox({ pendingPairingId: () => PENDING })
}

function completedMessage1(): EndpointOwnedPairingMailbox {
  const mailbox = fixture()
  mailbox.createChallenge({
    challengeId: CHALLENGE, accountId: ACCOUNT, desktopInstallationId: DESKTOP,
    expiresAt: 2_000,
  })
  mailbox.submitMessage1({
    challengeId: CHALLENGE, completionId: COMPLETION, accountId: ACCOUNT,
    mobileInstallationId: MOBILE, device: DEVICE, message1: Uint8Array.of(11), now: 1_000,
  })
  return mailbox
}
