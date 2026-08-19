import type { AccountProof, PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { CompanionPushHint, CompanionPushToken, RelayRouteId } from '@deepseek-ai/dsh-remote-protocol'

/** Mobile operating system whose native push channel carries the hint. */
export type PushPlatform = 'ios' | 'android'

/** Authenticated caller identity for Remote Push operations, mirroring the Remote Access proof headers. */
export interface RemotePushAuthentication {
  /** Current Platform Account access token. */
  accessToken: string
  /** Single-use proof created by the Installation key. */
  proof: AccountProof
}

/** One device push token bound to one Personal Pairing route. */
export interface PushTokenRegistration {
  routeId: RelayRouteId
  platform: PushPlatform
  token: CompanionPushToken
}

/** A stored registration with its commit timestamp. */
export interface PushTokenRecord extends PushTokenRegistration {
  registeredAt: number
}

/** Delivery result; `unregistered` prunes the dead token from the store. */
export type PushDeliveryOutcome = 'delivered' | 'unregistered'

/** Vendor delivery adapter role: project one content-free hint onto one native push channel. */
export interface CompanionPushDelivery {
  /**
   * Deliver one hint to one registered device.
   * @param target - stored registration selected by the fan-out.
   * @param hint - content-free hint; adapters must not enrich it.
   * @returns delivery outcome; `unregistered` marks the token dead.
   */
  deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome>
}

/** Deployment-owned durable push-token persistence. */
export interface PushTokenStore {
  /**
   * Upsert one registration for an authenticated Account.
   * @param accountId - authenticated Account owning the pairing route.
   * @param registration - device token bound to one route.
   */
  put(accountId: PlatformAccountId, registration: PushTokenRegistration): Promise<void>
  /**
   * Remove exactly one token, as on Mobile unpair.
   * @param accountId - authenticated Account owning the route.
   * @param routeId - pairing route the token belongs to.
   * @param token - exact token to drop.
   */
  remove(accountId: PlatformAccountId, routeId: RelayRouteId, token: CompanionPushToken): Promise<void>
  /**
   * Remove every token of one route, as on pairing revocation or Mobile Access disable.
   * @param accountId - authenticated Account owning the route.
   * @param routeId - revoked route.
   */
  removeRoute(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<void>
  /**
   * List the live tokens a hint fans out to.
   * @param accountId - authenticated Account owning the route.
   * @param routeId - route whose devices receive the hint.
   * @returns stored registrations in insertion order.
   */
  list(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<readonly PushTokenRecord[]>
}
