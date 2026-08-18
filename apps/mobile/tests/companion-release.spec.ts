import { describe, expect, it } from 'vitest'
import {
  COMPANION_RELEASE_DEVICE_CHECKS,
  COMPANION_RELEASE_FLOWS,
  COMPANION_RELEASE_PLATFORMS,
  authorizeCompanionDistribution,
  companionReleaseReady,
  type CompanionReleaseEvidence,
} from '../src/companion-release.ts'

function complete(): CompanionReleaseEvidence {
  return {
    flows: new Set(COMPANION_RELEASE_FLOWS),
    devices: new Set(COMPANION_RELEASE_PLATFORMS.flatMap(platform =>
      COMPANION_RELEASE_DEVICE_CHECKS.map(check => `${platform}:${check}` as const),
    )),
    upgradePreservedKeys: true,
    uiAcceptance: true,
    failureAcceptance: true,
    noiseReview: true,
  }
}

describe('Companion release validation', () => {
  it('requires every flow, both platforms, upgrade, UI, failure, and Noise review', () => {
    expect(companionReleaseReady(complete())).toBe(true)
    expect(companionReleaseReady({ ...complete(), noiseReview: false })).toBe(false)
    expect(companionReleaseReady({ ...complete(), upgradePreservedKeys: false })).toBe(false)
    expect(companionReleaseReady({ ...complete(), uiAcceptance: false })).toBe(false)
    expect(companionReleaseReady({ ...complete(), failureAcceptance: false })).toBe(false)
    expect(companionReleaseReady({ ...complete(), flows: new Set(COMPANION_RELEASE_FLOWS.slice(1)) })).toBe(false)
    expect(companionReleaseReady({ ...complete(), devices: new Set() })).toBe(false)
  })

  it('does not authorize TestFlight or Android APK without explicit approval', () => {
    expect(authorizeCompanionDistribution(complete(), {})).toEqual({ testFlight: false, androidApk: false })
    expect(authorizeCompanionDistribution(complete(), { testFlight: true })).toEqual({ testFlight: true, androidApk: false })
    expect(() => authorizeCompanionDistribution({ ...complete(), uiAcceptance: false }, { testFlight: true }))
      .toThrow('incomplete')
  })
})
