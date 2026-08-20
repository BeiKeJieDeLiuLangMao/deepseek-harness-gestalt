/**
 * Content-free Companion push fan-out owned by Remote Access: token lifecycle,
 * generic-hint delivery adapters, and dead-token pruning. Push stays inside this
 * capability; it is not a generic Platform notification bus.
 * @module @deepseek-ai/dsh-remote-access
 */

import type { InstallationId, PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  buildApnsPushPayload,
  buildFcmPushMessage,
  companionPushHintForEvent,
  parseCompanionPushHint,
  parseCompanionPushToken,
  parseRelayRouteId,
  type ApnsPushPayload,
  type CompanionPushEventKind,
  type CompanionPushHint,
  type CompanionPushToken,
  type FcmPushMessage,
  type RelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'

/** Mobile operating system whose native push channel carries the hint. */
export type PushPlatform = 'ios' | 'android'

/** One device push token bound to one Personal Pairing route. */
export interface PushTokenRegistration {
  routeId: RelayRouteId
  platform: PushPlatform
  token: CompanionPushToken
}

/** Stored registration with its owning Installation and commit timestamp. */
export interface PushTokenRecord extends PushTokenRegistration {
  /** Authenticated Mobile Installation that registered the token. */
  installationId: InstallationId
  registeredAt: number
}

/** Delivery result; `unregistered` prunes the dead token from the store. */
export type PushDeliveryOutcome = 'delivered' | 'unregistered'

/** Fan-out result for one published hint. */
export interface CompanionPushReport {
  /** Tokens that accepted the hint. */
  delivered: number
  /** Dead tokens the vendor reported and the store pruned. */
  pruned: number
}

/** Vendor delivery adapter role: project one content-free hint onto one native channel. */
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
   * Upsert one registration for an authenticated Account and Installation.
   * @param accountId - authenticated Account owning the pairing route.
   * @param installationId - Mobile Installation that presented the token.
   * @param registration - device token bound to one route.
   */
  put(
    accountId: PlatformAccountId,
    installationId: InstallationId,
    registration: PushTokenRegistration,
  ): Promise<void>
  /**
   * Remove exactly one token, as on Mobile unpair.
   * @param accountId - authenticated Account owning the route.
   * @param routeId - pairing route the token belongs to.
   * @param token - exact token to drop.
   */
  remove(accountId: PlatformAccountId, routeId: RelayRouteId, token: CompanionPushToken): Promise<void>
  /**
   * Remove every token registered by one Mobile Installation on one route.
   * @param accountId - authenticated Account owning the route.
   * @param routeId - pairing route the Installation used.
   * @param installationId - revoked Mobile Installation.
   */
  removeInstallation(
    accountId: PlatformAccountId,
    routeId: RelayRouteId,
    installationId: InstallationId,
  ): Promise<void>
  /**
   * Remove every token registered by one Mobile Installation, including after
   * the Desktop route is already gone.
   * @param accountId - authenticated Account that owned the pairing.
   * @param installationId - revoked Mobile Installation.
   */
  removeInstallationTokens(
    accountId: PlatformAccountId,
    installationId: InstallationId,
  ): Promise<void>
  /**
   * Remove every token of one route, as on pairing revoke-all or Mobile Access disable.
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

/** Injected APNs/FCM transport used by vendor adapters and test doubles. */
export interface NativePushTransport {
  /**
   * Deliver one already-projected vendor payload.
   * @param request - platform, token, and content-free payload.
   * @returns delivery outcome.
   */
  send(request: {
    platform: PushPlatform
    token: CompanionPushToken
    payload: ApnsPushPayload | FcmPushMessage
  }): Promise<PushDeliveryOutcome>
}

interface StoredPushTokenRecord extends PushTokenRecord {
  accountId: PlatformAccountId
}

/** In-memory token store for keyless development and tests. */
export class MemoryPushTokenStore implements PushTokenStore {
  private readonly records: StoredPushTokenRecord[] = []
  private readonly now: () => number

  /** @param options - optional clock; defaults to the wall clock. */
  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now
  }

  put(
    accountId: PlatformAccountId,
    installationId: InstallationId,
    registration: PushTokenRegistration,
  ): Promise<void> {
    this.removeMatching(record => record.token === registration.token)
    this.records.push({
      ...registration,
      accountId,
      installationId,
      registeredAt: this.now(),
    })
    return Promise.resolve()
  }

  remove(accountId: PlatformAccountId, routeId: RelayRouteId, token: CompanionPushToken): Promise<void> {
    this.removeMatching(record =>
      record.accountId === accountId && record.routeId === routeId && record.token === token)
    return Promise.resolve()
  }

  removeInstallation(
    accountId: PlatformAccountId,
    routeId: RelayRouteId,
    installationId: InstallationId,
  ): Promise<void> {
    this.removeMatching(record =>
      record.accountId === accountId
      && record.routeId === routeId
      && record.installationId === installationId)
    return Promise.resolve()
  }

  removeInstallationTokens(
    accountId: PlatformAccountId,
    installationId: InstallationId,
  ): Promise<void> {
    this.removeMatching(record =>
      record.accountId === accountId && record.installationId === installationId)
    return Promise.resolve()
  }

  removeRoute(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<void> {
    this.removeMatching(record => record.accountId === accountId && record.routeId === routeId)
    return Promise.resolve()
  }

  list(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<readonly PushTokenRecord[]> {
    return Promise.resolve(this.records
      .filter(record => record.accountId === accountId && record.routeId === routeId)
      .map(({ accountId: _accountId, ...record }) => record))
  }

  private removeMatching(match: (record: StoredPushTokenRecord) => boolean): void {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index] as StoredPushTokenRecord
      if (match(record)) this.records.splice(index, 1)
    }
  }
}

/** One keyless development delivery record. */
export interface KeylessPushDeliveryRecord {
  target: PushTokenRegistration
  hint: CompanionPushHint
}

/**
 * Explicit development-only delivery adapter; it delivers nothing. It records
 * each fan-out so development compositions and tests can observe exact hints
 * without APNs/FCM credentials.
 */
export class KeylessCompanionPushDelivery implements CompanionPushDelivery {
  /** Every hint this adapter was asked to deliver, in order. */
  readonly outbox: KeylessPushDeliveryRecord[] = []

  deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome> {
    this.outbox.push({ target, hint })
    return Promise.resolve('delivered')
  }
}

/** Stable Remote Access push failure codes safe to surface to authenticated callers. */
export type CompanionPushErrorCode = 'PUSH_PROVIDER_UNAVAILABLE' | 'PUSH_DELIVERY_FAILED'

/** Stable content-free Remote Access push failure. */
export class CompanionPushError extends Error {
  /** @param code - failure category. @param message - diagnostic without tokens or Session content. */
  constructor(readonly code: CompanionPushErrorCode, message: string) {
    super(message)
    this.name = 'CompanionPushError'
  }
}

/**
 * Platform-switching delivery adapter: routes each target to its platform's
 * vendor adapter and fails loud when that platform has none.
 */
export class CompanionPushDeliveryRouter implements CompanionPushDelivery {
  private readonly adapters: Partial<Record<PushPlatform, CompanionPushDelivery>>

  /** @param adapters - vendor adapter per platform; at least one platform is required. */
  constructor(adapters: Partial<Record<PushPlatform, CompanionPushDelivery>>) {
    if (adapters.ios === undefined && adapters.android === undefined) {
      throw new CompanionPushError(
        'PUSH_PROVIDER_UNAVAILABLE',
        'Remote Access push requires at least one platform delivery adapter',
      )
    }
    this.adapters = { ...adapters }
  }

  async deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome> {
    const adapter = this.adapters[target.platform]
    if (adapter === undefined) {
      throw new CompanionPushError(
        'PUSH_PROVIDER_UNAVAILABLE',
        `Remote Access push has no ${target.platform} delivery adapter`,
      )
    }
    return adapter.deliver(target, hint)
  }
}

/** APNs adapter: projects the protocol payload and sends it through the injected transport. */
export class ApnsCompanionPushDelivery implements CompanionPushDelivery {
  /** @param transport - APNs HTTP test double or deployment client. */
  constructor(private readonly transport: NativePushTransport) {}

  deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome> {
    if (target.platform !== 'ios') {
      throw new CompanionPushError('PUSH_PROVIDER_UNAVAILABLE', 'APNs adapter delivers only iOS tokens')
    }
    return this.transport.send({
      platform: 'ios',
      token: target.token,
      payload: buildApnsPushPayload(hint),
    })
  }
}

/** FCM adapter: projects the protocol payload and sends it through the injected transport. */
export class FcmCompanionPushDelivery implements CompanionPushDelivery {
  /** @param transport - FCM HTTP test double or deployment client. */
  constructor(private readonly transport: NativePushTransport) {}

  deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome> {
    if (target.platform !== 'android') {
      throw new CompanionPushError('PUSH_PROVIDER_UNAVAILABLE', 'FCM adapter delivers only Android tokens')
    }
    return this.transport.send({
      platform: 'android',
      token: target.token,
      payload: buildFcmPushMessage(hint, target.token),
    })
  }
}

/**
 * Desktop Session or Companion event that may become a hint after a durable commit.
 * Streaming is discarded at this layer even when `committed` is true.
 */
export interface DurableCompanionPushEvent {
  kind: CompanionPushEventKind
  routeId: RelayRouteId
  sessionRef?: string
  /** True only after Desktop persisted the pending interaction or terminal outcome. */
  committed: boolean
}

/**
 * Project a Desktop event onto a hint only after the owning record is durable.
 * Streaming never produces a hint.
 * @param event - Desktop event plus whether its pending or terminal state has committed.
 * @returns the content-free hint, or `undefined` when streaming or not yet committed.
 */
export function companionPushHintAfterDurableCommit(
  event: DurableCompanionPushEvent,
): CompanionPushHint | undefined {
  if (!event.committed) return undefined
  return companionPushHintForEvent({
    kind: event.kind,
    routeId: event.routeId,
    ...(event.sessionRef === undefined ? {} : { sessionRef: event.sessionRef }),
  })
}

/** Desktop adapter that publishes a hint only after a durable pending or terminal commit. */
export class DesktopCompanionPushPublisher {
  /**
   * @param publish - already-authenticated Remote Access publish entry.
   */
  constructor(private readonly publish: (hint: CompanionPushHint) => Promise<CompanionPushReport>) {}

  /**
   * Observe one Desktop event. Streaming and uncommitted records leave the outbox empty.
   * @param event - Desktop event and commit flag.
   * @returns delivery report after a committed non-streaming event; otherwise `undefined`.
   */
  handle(event: DurableCompanionPushEvent): Promise<CompanionPushReport | undefined> {
    const hint = companionPushHintAfterDurableCommit(event)
    if (hint === undefined) return Promise.resolve(undefined)
    return this.publish(hint)
  }
}

/**
 * Parse one device registration at the Remote Access executor.
 * @param value - untrusted registration.
 * @returns allowlisted registration.
 */
export function parsePushTokenRegistration(value: unknown): PushTokenRegistration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Push token registration must be an object')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'routeId' && key !== 'platform' && key !== 'token')) {
    throw new TypeError('Push token registration contains unsupported fields')
  }
  if (record.platform !== 'ios' && record.platform !== 'android') {
    throw new TypeError('Push token platform is unsupported')
  }
  return {
    routeId: parseRelayRouteId(record.routeId),
    platform: record.platform,
    token: parseCompanionPushToken(record.token),
  }
}

/**
 * Fan one content-free hint out to every live token of its route and prune dead tokens.
 * @param store - token persistence.
 * @param delivery - vendor or keyless adapter.
 * @param accountId - authenticated Account owning the route.
 * @param hint - generic hint; never enriched.
 * @returns delivery and pruning counts.
 */
export async function publishCompanionPushHint(
  store: PushTokenStore,
  delivery: CompanionPushDelivery,
  accountId: PlatformAccountId,
  hint: CompanionPushHint,
): Promise<CompanionPushReport> {
  const allowlisted = parseCompanionPushHint(hint)
  const targets = await store.list(accountId, allowlisted.routeId)
  const settled = await Promise.allSettled(targets.map(async (target) => {
    const outcome = await delivery.deliver(target, allowlisted)
    if (outcome === 'unregistered') await store.remove(accountId, target.routeId, target.token)
    return outcome
  }))
  const failures = settled.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
  if (failures.length > 0) {
    throw new CompanionPushError('PUSH_DELIVERY_FAILED', 'Remote Access push delivery failed')
  }
  return {
    delivered: settled.filter(result => result.status === 'fulfilled' && result.value === 'delivered').length,
    pruned: settled.filter(result => result.status === 'fulfilled' && result.value === 'unregistered').length,
  }
}
