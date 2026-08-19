/** Open-registration quotas and capacity shedding for Personal Pairing Platform. */

/** Stable error code for capacity watermarks. */
export const PLATFORM_CAPACITY = 'PLATFORM_CAPACITY'

/** Open-registration ceilings. */
export const OPEN_REGISTRATION_QUOTAS = {
  desktopInstallations: 10,
  mobileInstallations: 10,
  personalPairings: 50,
  concurrentConnections: 20,
  pairingChallengesPerAccountPerHour: 10,
  pairingChallengesPerIpPerHour: 30,
  concurrentBlobs: 5,
  blobBytes: 100 * 1024 * 1024,
  blobBytesPerAccountPerDay: 1024 * 1024 * 1024,
  pushHintsPerAccountPerDay: 500,
} as const

/** Current usage against the open-registration ceilings. */
export interface OpenRegistrationUsage {
  /** Live Desktop installations for the account. */
  desktopInstallations: number
  /** Live Mobile installations for the account. */
  mobileInstallations: number
  /** Live Personal Pairings for the account. */
  personalPairings: number
  /** Concurrent Platform connections. */
  concurrentConnections: number
  /** Pairing challenges issued this hour for the account. */
  pairingChallengesThisHour: number
  /** Pairing challenges issued this hour from the IP. */
  pairingChallengesThisIpHour: number
  /** Concurrent attachment blobs. */
  concurrentBlobs: number
  /** Size of the current blob in bytes. */
  blobBytes: number
  /** Uploaded attachment bytes today. */
  blobBytesToday: number
  /** Push hints emitted today. */
  pushHintsToday: number
}

/** Admission request that may be shed. */
export type OpenRegistrationRequest =
  | {
    /** New account login. */
    kind: 'login'
  }
  | {
    /** New pairing challenge. */
    kind: 'pairing'
  }
  | {
    /** New attachment upload. */
    kind: 'blob'
  }
  | {
    /** New WSS attach. */
    kind: 'wss'
  }
  | {
    /** Established ciphertext stream. */
    kind: 'stream'
  }

/** Quota or capacity decision. */
export type OpenRegistrationDecision =
  | {
    /** Request is admitted. */
    ok: true
  }
  | {
    /** Request is shed. */
    ok: false
    /** Stable quota or capacity code. */
    code: typeof PLATFORM_CAPACITY | 'QUOTA'
    /** Retry hint in seconds. */
    retryAfter: number
  }

/**
 * Admit or shed an open-registration request. Established streams are not throttled.
 * @param usage - current counters.
 * @param request - new or established request.
 * @param capacity - when true, new login/pairing/blob/WSS attach is shed.
 * @param retryAfter - retry hint in seconds.
 * @returns the shed-or-admit decision.
 */
export function decideOpenRegistration(
  usage: OpenRegistrationUsage,
  request: OpenRegistrationRequest,
  capacity: boolean,
  retryAfter: number,
): OpenRegistrationDecision {
  if (request.kind === 'stream') return { ok: true }
  if (capacity) return { ok: false, code: PLATFORM_CAPACITY, retryAfter }
  const exceeded =
    usage.desktopInstallations > OPEN_REGISTRATION_QUOTAS.desktopInstallations
    || usage.mobileInstallations > OPEN_REGISTRATION_QUOTAS.mobileInstallations
    || usage.personalPairings > OPEN_REGISTRATION_QUOTAS.personalPairings
    || usage.concurrentConnections > OPEN_REGISTRATION_QUOTAS.concurrentConnections
    || usage.pairingChallengesThisHour > OPEN_REGISTRATION_QUOTAS.pairingChallengesPerAccountPerHour
    || usage.pairingChallengesThisIpHour > OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour
    || usage.concurrentBlobs > OPEN_REGISTRATION_QUOTAS.concurrentBlobs
    || usage.blobBytes > OPEN_REGISTRATION_QUOTAS.blobBytes
    || usage.blobBytesToday > OPEN_REGISTRATION_QUOTAS.blobBytesPerAccountPerDay
    || usage.pushHintsToday > OPEN_REGISTRATION_QUOTAS.pushHintsPerAccountPerDay
  if (exceeded) return { ok: false, code: 'QUOTA', retryAfter }
  return { ok: true }
}
