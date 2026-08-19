import { describe, expect, it } from 'vitest'
import {
  MemoryPlatformCapacityGate,
  OPEN_REGISTRATION_QUOTAS,
  PLATFORM_CAPACITY,
  decideOpenRegistration,
  retryAfterSecondsUntil,
  type OpenRegistrationRequest,
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
  it('admits established streams even when every quota is over the ceiling and capacity is shedding', () => {
    const over: OpenRegistrationUsage = {
      desktopInstallations: OPEN_REGISTRATION_QUOTAS.desktopInstallations + 1,
      mobileInstallations: OPEN_REGISTRATION_QUOTAS.mobileInstallations + 1,
      personalPairings: OPEN_REGISTRATION_QUOTAS.personalPairings + 1,
      concurrentConnections: OPEN_REGISTRATION_QUOTAS.concurrentConnections + 1,
      pairingChallengesThisHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerAccountPerHour + 1,
      pairingChallengesThisIpHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour + 1,
      concurrentBlobs: OPEN_REGISTRATION_QUOTAS.concurrentBlobs + 1,
      blobBytes: OPEN_REGISTRATION_QUOTAS.blobBytes + 1,
      blobBytesToday: OPEN_REGISTRATION_QUOTAS.blobBytesPerAccountPerDay + 1,
      pushHintsToday: OPEN_REGISTRATION_QUOTAS.pushHintsPerAccountPerDay + 1,
    }
    expect(decideOpenRegistration(over, { kind: 'stream' }, true, 30)).toEqual({ ok: true })
    expect(decideOpenRegistration(within, { kind: 'login', installationKind: 'desktop' }, false, 30))
      .toEqual({ ok: true })
  })

  it('sheds new login, pairing, blob, and WSS attach with PLATFORM_CAPACITY and still admits push', () => {
    for (const request of [
      { kind: 'login', installationKind: 'desktop' },
      { kind: 'pairing' },
      { kind: 'blob' },
      { kind: 'wss' },
    ] as const) {
      expect(decideOpenRegistration(within, request, true, 45))
        .toEqual({ ok: false, code: PLATFORM_CAPACITY, retryAfter: 45 })
    }
    expect(decideOpenRegistration(within, { kind: 'push' }, true, 45)).toEqual({ ok: true })
  })

  it('accepts each ceiling exactly and rejects only the owning request when usage is over', () => {
    expect(decideOpenRegistration({
      ...within,
      desktopInstallations: OPEN_REGISTRATION_QUOTAS.desktopInstallations,
    }, { kind: 'login', installationKind: 'desktop' }, false, 12)).toEqual({ ok: true })
    expect(decideOpenRegistration({
      ...within,
      desktopInstallations: OPEN_REGISTRATION_QUOTAS.desktopInstallations + 1,
    }, { kind: 'login', installationKind: 'desktop' }, false, 12))
      .toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      desktopInstallations: OPEN_REGISTRATION_QUOTAS.desktopInstallations + 1,
    }, { kind: 'login', installationKind: 'mobile' }, false, 12)).toEqual({ ok: true })
    expect(decideOpenRegistration({
      ...within,
      pairingChallengesThisIpHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour + 1,
    }, { kind: 'blob' }, false, 12)).toEqual({ ok: true })
    expect(decideOpenRegistration({
      ...within,
      pairingChallengesThisIpHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour + 1,
    }, { kind: 'pairing' }, false, 12))
      .toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      mobileInstallations: OPEN_REGISTRATION_QUOTAS.mobileInstallations + 1,
    }, { kind: 'login', installationKind: 'mobile' }, false, 12))
      .toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      concurrentConnections: OPEN_REGISTRATION_QUOTAS.concurrentConnections + 1,
    }, { kind: 'wss' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      pushHintsToday: OPEN_REGISTRATION_QUOTAS.pushHintsPerAccountPerDay + 1,
    }, { kind: 'push' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      blobBytes: OPEN_REGISTRATION_QUOTAS.blobBytes + 1,
    }, { kind: 'blob' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      concurrentBlobs: OPEN_REGISTRATION_QUOTAS.concurrentBlobs + 1,
    }, { kind: 'blob' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      blobBytesToday: OPEN_REGISTRATION_QUOTAS.blobBytesPerAccountPerDay + 1,
    }, { kind: 'blob' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      personalPairings: OPEN_REGISTRATION_QUOTAS.personalPairings + 1,
    }, { kind: 'pairing' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      pairingChallengesThisHour: OPEN_REGISTRATION_QUOTAS.pairingChallengesPerAccountPerHour + 1,
    }, { kind: 'pairing' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
    expect(decideOpenRegistration({
      ...within,
      concurrentConnections: OPEN_REGISTRATION_QUOTAS.concurrentConnections + 1,
    }, { kind: 'login', installationKind: 'desktop' }, false, 12)).toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
  })

  it('marks the shared watermark as shedding only after the last live slot is acquired', () => {
    expect(() => new MemoryPlatformCapacityGate(0, 1_000)).toThrow('maxAttachments')
    expect(() => new MemoryPlatformCapacityGate(1, 0)).toThrow('retryAfterMs')
    const gate = new MemoryPlatformCapacityGate(1, 4_500)
    expect(gate.shedding).toBe(false)
    expect(gate.tryAcquire()).toBe(true)
    expect(gate.shedding).toBe(true)
    expect(gate.tryAcquire()).toBe(false)
    expect(gate.retryAfterSeconds).toBe(5)
    gate.release()
    gate.release()
    expect(gate.shedding).toBe(false)
  })

  it('clamps exhausted quota windows to a one-second retry hint', () => {
    expect(retryAfterSecondsUntil(0, 1_000, 5_000)).toBe(1)
  })

  it('rejects an unrecognized request kind at the closed quota switch', () => {
    expect(decideOpenRegistration(within, { kind: 'other' } as unknown as OpenRegistrationRequest, false, 12))
      .toEqual({ ok: false, code: 'QUOTA', retryAfter: 12 })
  })
})
