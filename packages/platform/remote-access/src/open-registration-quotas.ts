/** Open-registration quotas and capacity shedding for Personal Pairing Platform. */

import {
  ACCOUNT_OPEN_REGISTRATION_QUOTAS,
  OPEN_REGISTRATION_HARD_CAP_RETRY_AFTER_SECONDS,
  type PlatformCapacityState,
} from '@deepseek-ai/dsh-platform-account'

/** Stable error code for capacity watermarks. */
export const PLATFORM_CAPACITY = 'PLATFORM_CAPACITY'
/** Sliding pairing-challenge window. */
export const PAIRING_CHALLENGE_QUOTA_WINDOW_MS = 60 * 60 * 1000
/** Sliding blob-upload and push-hint window. */
export const ACCOUNT_DAILY_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000

export { OPEN_REGISTRATION_HARD_CAP_RETRY_AFTER_SECONDS }

/** Open-registration ceilings. */
export const OPEN_REGISTRATION_QUOTAS = {
  ...ACCOUNT_OPEN_REGISTRATION_QUOTAS,
  personalPairings: 50,
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
    /** Installation class being registered. */
    installationKind: 'desktop' | 'mobile'
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
    /** New push hint. */
    kind: 'push'
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
 * @returns whether the request is admitted or shed.
 */
export function decideOpenRegistration(
  usage: OpenRegistrationUsage,
  request: OpenRegistrationRequest,
  capacity: boolean,
  retryAfter: number,
): OpenRegistrationDecision {
  if (request.kind === 'stream') return { ok: true }
  if (capacity && request.kind !== 'push') return { ok: false, code: PLATFORM_CAPACITY, retryAfter }
  if (quotaExceeded(usage, request)) return { ok: false, code: 'QUOTA', retryAfter }
  return { ok: true }
}

function quotaExceeded(
  usage: OpenRegistrationUsage,
  request: Exclude<OpenRegistrationRequest, { kind: 'stream' }>,
): boolean {
  switch (request.kind) {
    case 'login':
      return request.installationKind === 'desktop'
        ? usage.desktopInstallations > OPEN_REGISTRATION_QUOTAS.desktopInstallations
          || usage.concurrentConnections > OPEN_REGISTRATION_QUOTAS.concurrentConnections
        : usage.mobileInstallations > OPEN_REGISTRATION_QUOTAS.mobileInstallations
          || usage.concurrentConnections > OPEN_REGISTRATION_QUOTAS.concurrentConnections
    case 'pairing':
      return usage.personalPairings > OPEN_REGISTRATION_QUOTAS.personalPairings
        || usage.pairingChallengesThisHour > OPEN_REGISTRATION_QUOTAS.pairingChallengesPerAccountPerHour
        || usage.pairingChallengesThisIpHour > OPEN_REGISTRATION_QUOTAS.pairingChallengesPerIpPerHour
    case 'blob':
      return usage.concurrentBlobs > OPEN_REGISTRATION_QUOTAS.concurrentBlobs
        || usage.blobBytes > OPEN_REGISTRATION_QUOTAS.blobBytes
        || usage.blobBytesToday > OPEN_REGISTRATION_QUOTAS.blobBytesPerAccountPerDay
    case 'push':
      return usage.pushHintsToday > OPEN_REGISTRATION_QUOTAS.pushHintsPerAccountPerDay
    case 'wss':
      return usage.concurrentConnections > OPEN_REGISTRATION_QUOTAS.concurrentConnections
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

/** Shared capacity watermark that sheds new acquisitions while live attachments remain. */
export class MemoryPlatformCapacityGate implements PlatformCapacityState {
  private attachments = 0

  /**
   * @param maxAttachments - deployment-varying live WSS watermark.
   * @param retryAfterMs - deployment-varying retry delay returned on shed.
   */
  constructor(readonly maxAttachments: number, readonly retryAfterMs: number) {
    if (!Number.isSafeInteger(maxAttachments) || maxAttachments < 1) {
      throw new TypeError('Platform capacity maxAttachments must be a positive integer')
    }
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 1) {
      throw new TypeError('Platform capacity retryAfterMs must be a positive integer')
    }
  }

  /** Whether new login, pairing, blob, or WSS attach must be shed. */
  get shedding(): boolean {
    return this.attachments >= this.maxAttachments
  }

  /** HTTP retry delay in seconds. */
  get retryAfterSeconds(): number {
    return Math.max(1, Math.ceil(this.retryAfterMs / 1_000))
  }

  /**
   * Reserve one live attachment slot.
   * @returns false when the watermark is already full.
   */
  tryAcquire(): boolean {
    if (this.shedding) return false
    this.attachments += 1
    return true
  }

  /** Release one live attachment slot after close. */
  release(): void {
    if (this.attachments > 0) this.attachments -= 1
  }
}

/**
 * Remaining seconds until `timestamp` plus `windowMs`.
 * @param timestamp - oldest event in the window.
 * @param windowMs - sliding window length.
 * @param now - current epoch milliseconds.
 * @returns at least one second.
 */
export function retryAfterSecondsUntil(timestamp: number, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp + windowMs - now) / 1_000))
}
