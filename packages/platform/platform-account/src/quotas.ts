/** Spec-fixed open-registration ceilings owned by the Account capability. */

/** Maximum live Desktop installations retained by one Platform Account. */
export const ACCOUNT_DESKTOP_INSTALLATION_LIMIT = 10
/** Maximum live Mobile installations retained by one Platform Account. */
export const ACCOUNT_MOBILE_INSTALLATION_LIMIT = 10
/** Maximum concurrent tracked Platform connections for one Platform Account. */
export const ACCOUNT_CONCURRENT_CONNECTION_LIMIT = 20
/** Retry delay for hard-cap quota rejections that have no sliding window. */
export const OPEN_REGISTRATION_HARD_CAP_RETRY_AFTER_SECONDS = 60

/** Login-owned subset of the open-registration ceilings. */
export const ACCOUNT_OPEN_REGISTRATION_QUOTAS = {
  desktopInstallations: ACCOUNT_DESKTOP_INSTALLATION_LIMIT,
  mobileInstallations: ACCOUNT_MOBILE_INSTALLATION_LIMIT,
  concurrentConnections: ACCOUNT_CONCURRENT_CONNECTION_LIMIT,
} as const

/** Shared capacity watermark consulted by login, pairing, blob, and WSS admission. */
export interface PlatformCapacityState {
  /** Whether the two-instance service is shedding new acquisitions. */
  readonly shedding: boolean
  /** HTTP `retryAfter` delay in seconds for `PLATFORM_CAPACITY`. */
  readonly retryAfterSeconds: number
}
