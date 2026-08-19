import { describe, expect, it } from 'vitest'
import {
  OPEN_REGISTRATION_QUOTAS,
  PLATFORM_CAPACITY,
  decideOpenRegistration,
  type OpenRegistrationUsage,
} from '../src/open-registration-quotas.ts'

const within: OpenRegistrationUsage = {
  desktopInstallations: 1,
  mobileInstallations: 1,
  personalPairings: 1,
  concurrentConnections: 1,
  pairingChallengesThisHour: 1,
  pairingChallengesThisIpHour: 1,
  concurrentBlobs: 1,
  blobBytes: 1,
  blobBytesToday: 1,
  pushHintsToday: 1,
}

describe('open-registration quotas', () => {
  it('admits established streams even when capacity is shedding', () => {
    expect(decideOpenRegistration(within, { kind: 'stream' }, true, 30)).toEqual({ ok: true })
    expect(decideOpenRegistration(within, { kind: 'login' }, false, 30)).toEqual({ ok: true })
  })

  it('sheds new login, pairing, blob, and WSS attach with PLATFORM_CAPACITY', () => {
    for (const kind of ['login', 'pairing', 'blob', 'wss'] as const) {
      expect(decideOpenRegistration(within, { kind }, true, 45))
        .toEqual({ ok: false, code: PLATFORM_CAPACITY, retryAfter: 45 })
    }
  })

  it('rejects each open-registration ceiling independently', () => {
    const cases: Array<keyof OpenRegistrationUsage> = [
      'desktopInstallations',
      'mobileInstallations',
      'personalPairings',
      'concurrentConnections',
      'pairingChallengesThisHour',
      'pairingChallengesThisIpHour',
      'concurrentBlobs',
      'blobBytes',
      'blobBytesToday',
      'pushHintsToday',
    ]
    const limits: Record<keyof OpenRegistrationUsage, number> = {
      desktopInstallations: OPEN_REGISTRATION_QUOTAS.desktopInstallations,
      mobileInstallations: OPEN_REGISTRATION_QUOTAS.mobileInstallations,
      personalPairings: OPEN_REGISTRATION_QUOTAS.personalPairings,
      concurrentConnections: OPEN_REGISTRATION_QUOTAS.concurrentConnections,
      pairingChallengesThisHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerAccountPerHour,
      pairingChallengesThisIpHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour,
      concurrentBlobs: OPEN_REGISTRATION_QUOTAS.concurrentBlobs,
      blobBytes: OPEN_REGISTRATION_QUOTAS.blobBytes,
      blobBytesToday: OPEN_REGISTRATION_QUOTAS.blobBytesPerAccountPerDay,
      pushHintsToday: OPEN_REGISTRATION_QUOTAS.pushHintsPerAccountPerDay,
    }
    for (const key of cases) {
      expect(decideOpenRegistration({ ...within, [key]: limits[key] + 1 }, { kind: 'login' }, false, 12))
        .toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    }
  })
})
