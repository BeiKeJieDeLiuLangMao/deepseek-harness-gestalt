/**
 * Service Definition for the content-free Companion push seam (`ctx.remotePush`):
 * the device push-token lifecycle plus generic-hint fan-out. Delivery adapters
 * are constructor-injected; development mounts the keyless adapter and real
 * APNs/FCM credentials stay in the deployment environment.
 * @module @deepseek-ai/dsh-remote-push
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { AccountService } from '@deepseek-ai/dsh-platform-account'
import type { CompanionPushHint, CompanionPushToken, RelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type {
  CompanionPushDelivery,
  PushDeliveryOutcome,
  PushPlatform,
  PushTokenRecord,
  PushTokenRegistration,
  PushTokenStore,
  RemotePushAuthentication,
} from './types.ts'

export type {
  CompanionPushDelivery,
  PushDeliveryOutcome,
  PushPlatform,
  PushTokenRecord,
  PushTokenRegistration,
  PushTokenStore,
  RemotePushAuthentication,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    remotePush: RemotePushService
  }
}

/** Stable Remote Push failure codes safe to surface to authenticated callers. */
export type RemotePushErrorCode = 'PUSH_PROVIDER_UNAVAILABLE' | 'PUSH_DELIVERY_FAILED'

/** Stable content-free Remote Push failure. */
export class RemotePushError extends Error {
  /** @param code - failure category. @param message - diagnostic without tokens or Session content. */
  constructor(readonly code: RemotePushErrorCode, message: string) {
    super(message)
    this.name = 'RemotePushError'
  }
}

/** Fan-out result for one published hint. */
export interface RemotePushReport {
  /** Tokens that accepted the hint. */
  delivered: number
  /** Dead tokens the vendor reported and the store pruned. */
  pruned: number
}

/** Public content-free Companion push capability used by the HTTP Consumer. */
export abstract class RemotePushService extends Service {
  /** @param ctx - Platform composition context receiving the push capability. */
  constructor(ctx: Context) { super(ctx, 'remotePush') }

  /**
   * Bind one device push token to one pairing route, replacing an older registration of the same token.
   * @param input - caller authentication and the registration.
   */
  abstract registerToken(input: {
    authentication: RemotePushAuthentication
    registration: PushTokenRegistration
  }): Promise<void>

  /**
   * Drop exactly one device push token, as on Mobile unpair.
   * @param input - caller authentication, route, and exact token.
   */
  abstract unregisterToken(input: {
    authentication: RemotePushAuthentication
    routeId: RelayRouteId
    token: CompanionPushToken
  }): Promise<void>

  /**
   * Drop every push token of one pairing route, as on pairing revocation or Mobile Access disable.
   * @param input - caller authentication and the revoked route.
   */
  abstract removeRoute(input: {
    authentication: RemotePushAuthentication
    routeId: RelayRouteId
  }): Promise<void>

  /**
   * Fan one content-free hint out to every live token of its route and prune dead tokens.
   * @param input - caller authentication and the generic hint.
   * @returns delivery and pruning counts.
   */
  abstract publish(input: {
    authentication: RemotePushAuthentication
    hint: CompanionPushHint
  }): Promise<RemotePushReport>
}

/** Remote Push provider construction inputs. */
export interface RemotePushProviderOptions {
  /** Account authentication seam shared with Remote Access. */
  account: Pick<AccountService, 'currentInstallation'>
  /** Deployment-owned token persistence. */
  store: PushTokenStore
  /** Vendor delivery adapter; development mounts the keyless adapter. */
  delivery: CompanionPushDelivery
}

/** Remote Push provider: authenticate, mutate or read the token store, fan out hints. */
export class RemotePushProvider extends RemotePushService {
  private readonly account: Pick<AccountService, 'currentInstallation'>
  private readonly store: PushTokenStore
  private readonly delivery: CompanionPushDelivery

  /** @param ctx - composition context. @param options - account seam, token store, and delivery adapter. */
  constructor(ctx: Context, options: RemotePushProviderOptions) {
    super(ctx)
    this.account = options.account
    this.store = options.store
    this.delivery = options.delivery
  }

  async registerToken(input: {
    authentication: RemotePushAuthentication
    registration: PushTokenRegistration
  }): Promise<void> {
    const accountId = await this.authenticate(input.authentication)
    await this.store.put(accountId, input.registration)
  }

  async unregisterToken(input: {
    authentication: RemotePushAuthentication
    routeId: RelayRouteId
    token: CompanionPushToken
  }): Promise<void> {
    const accountId = await this.authenticate(input.authentication)
    await this.store.remove(accountId, input.routeId, input.token)
  }

  async removeRoute(input: {
    authentication: RemotePushAuthentication
    routeId: RelayRouteId
  }): Promise<void> {
    const accountId = await this.authenticate(input.authentication)
    await this.store.removeRoute(accountId, input.routeId)
  }

  async publish(input: {
    authentication: RemotePushAuthentication
    hint: CompanionPushHint
  }): Promise<RemotePushReport> {
    const accountId = await this.authenticate(input.authentication)
    const targets = await this.store.list(accountId, input.hint.routeId)
    const settled = await Promise.allSettled(targets.map(async (target) => {
      const outcome = await this.delivery.deliver(target, input.hint)
      if (outcome === 'unregistered') await this.store.remove(accountId, target.routeId, target.token)
      return outcome
    }))
    const failures = settled.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
    if (failures.length > 0) throw new AggregateError(failures, 'Remote Push delivery failed')
    return {
      delivered: settled.filter(result => result.status === 'fulfilled' && result.value === 'delivered').length,
      pruned: settled.filter(result => result.status === 'fulfilled' && result.value === 'unregistered').length,
    }
  }

  private async authenticate(authentication: RemotePushAuthentication): Promise<PlatformAccountId> {
    const view = await this.account.currentInstallation(authentication)
    return view.account.id
  }
}

/** In-memory token store for keyless development and tests. */
export class MemoryPushTokenStore implements PushTokenStore {
  private readonly records: PushTokenRecord[] = []
  private readonly now: () => number

  /** @param options - optional clock; defaults to the wall clock. */
  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now
  }

  put(accountId: PlatformAccountId, registration: PushTokenRegistration): Promise<void> {
    this.removeMatching(accountId, registration.routeId, token => token === registration.token)
    this.records.push({ ...registration, registeredAt: this.now() })
    return Promise.resolve()
  }

  remove(accountId: PlatformAccountId, routeId: RelayRouteId, token: CompanionPushToken): Promise<void> {
    this.removeMatching(accountId, routeId, candidate => candidate === token)
    return Promise.resolve()
  }

  removeRoute(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<void> {
    this.removeMatching(accountId, routeId, () => true)
    return Promise.resolve()
  }

  list(accountId: PlatformAccountId, routeId: RelayRouteId): Promise<readonly PushTokenRecord[]> {
    return Promise.resolve(this.records.filter(record => this.owned(record, accountId, routeId)))
  }

  private removeMatching(
    accountId: PlatformAccountId,
    routeId: RelayRouteId,
    match: (token: CompanionPushToken) => boolean,
  ): void {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index] as PushTokenRecord
      if (this.owned(record, accountId, routeId) && match(record.token)) this.records.splice(index, 1)
    }
  }

  private owned(record: PushTokenRecord & { accountId?: PlatformAccountId }, accountId: PlatformAccountId, routeId: RelayRouteId): boolean {
    void accountId
    void routeId
    return record.routeId === routeId
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

/**
 * Platform-switching delivery adapter: routes each target to its platform's
 * vendor adapter and fails loud when that platform has none.
 */
export class CompanionPushDeliveryRouter implements CompanionPushDelivery {
  private readonly adapters: Partial<Record<PushPlatform, CompanionPushDelivery>>

  /** @param adapters - vendor adapter per platform; at least one platform is required. */
  constructor(adapters: Partial<Record<PushPlatform, CompanionPushDelivery>>) {
    if (adapters.ios === undefined && adapters.android === undefined) {
      throw new RemotePushError('PUSH_PROVIDER_UNAVAILABLE', 'Remote Push requires at least one platform delivery adapter')
    }
    this.adapters = { ...adapters }
  }

  async deliver(target: PushTokenRegistration, hint: CompanionPushHint): Promise<PushDeliveryOutcome> {
    const adapter = this.adapters[target.platform]
    if (adapter === undefined) {
      throw new RemotePushError('PUSH_PROVIDER_UNAVAILABLE', `Remote Push has no ${target.platform} delivery adapter`)
    }
    return adapter.deliver(target, hint)
  }
}
