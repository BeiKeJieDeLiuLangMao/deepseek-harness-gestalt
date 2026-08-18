/** Desktop Host ownership for Settings-only Personal Pairing projection. */

import type { DesktopPairingSnapshot } from '@deepseek-ai/dsh-client-ui-desktop/protocol'
import { parsePlatformAccountId, type PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parsePairingChallengeId,
  parsePairingRendezvousId,
  parsePendingPairingId,
  type PendingPairingId,
} from '@deepseek-ai/dsh-remote-access'
import {
  type DesktopRelayStopReason,
  type RemoteAccessTransport,
} from '@deepseek-ai/dsh-remote-access-client'
import {
  FailClosedDesktopRelayLifecycle,
  type DesktopRelayLifecycle,
} from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'
import type { DesktopAccountActions } from './platform-account.ts'

/** Host verbs exposed to the Mobile Pairing Settings section. */
export interface DesktopPairingActions {
  /** Read the current Settings projection. */
  getSnapshot(): DesktopPairingSnapshot
  /** Enable or disable Mobile Access. */
  setEnabled(enabled: boolean): Promise<DesktopPairingSnapshot>
  /** Create one two-minute invitation. */
  createChallenge(): Promise<DesktopPairingSnapshot>
  /** Cancel the active invitation. */
  cancelChallenge(): Promise<DesktopPairingSnapshot>
  /** Confirm matching words for one pending handshake. */
  confirm(pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot>
  /** Reject one pending handshake. */
  reject(pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot>
  /** Subscribe to Host-owned projection changes. */
  subscribe(listener: (snapshot: DesktopPairingSnapshot) => void): () => void
  /** Load Remote Access state after the Account installation has started. */
  start(): Promise<void>
  /** Stop polling and drain work when the current Account signs out. */
  deactivate(reason?: DesktopRelayStopReason): Promise<void>
  /** Drain lifecycle work during Desktop shutdown. */
  dispose(): Promise<void>
  /** Read transport-only Relay ownership for Host lifecycle evidence. */
  getRelayState(): { connected: boolean; stopReason?: DesktopRelayStopReason }
}

/** Real Settings controller construction inputs. */
export interface DesktopPairingControllerOptions {
  account: Pick<DesktopAccountActions, 'authorizeCurrentInstallation' | 'getSnapshot'>
  transport: RemoteAccessTransport
  /** Optional production-gated Relay lifecycle controlled by Mobile Access state. */
  relay?: DesktopRelayLifecycle
  randomId?: () => string
  now?: () => number
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  pollIntervalMs?: number
}

/** Host-owned controller backed by the authenticated Remote Access transport. */
export class DesktopPairingController implements DesktopPairingActions {
  private snapshot: DesktopPairingSnapshot = { status: 'ready', enabled: false, pairings: [] }
  private readonly listeners = new Set<(snapshot: DesktopPairingSnapshot) => void>()
  private readonly randomId: () => string
  private readonly now: () => number
  private readonly schedule: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  private readonly pollIntervalMs: number
  private serial: Promise<unknown> = Promise.resolve()
  private currentOperation: Promise<unknown> | undefined
  private lifecycleBarrier: Promise<void> = Promise.resolve()
  private lifecycleGeneration = 0
  private active = false
  private closed = false
  private accountId: PlatformAccountId | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  /** @param options - signed-in Account authority, Remote Access transport, and id source. */
  constructor(private readonly options: DesktopPairingControllerOptions) {
    this.randomId = options.randomId ?? (() => crypto.randomUUID())
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? ((task, delayMs) => setTimeout(task, delayMs))
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new TypeError('Desktop Pairing poll interval must be a positive integer')
    }
  }

  getSnapshot(): DesktopPairingSnapshot { return this.snapshot }

  getRelayState(): { connected: boolean; stopReason?: DesktopRelayStopReason } {
    return this.options.relay?.getState?.() ?? { connected: false }
  }

  subscribe(listener: (snapshot: DesktopPairingSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async setEnabled(enabled: boolean): Promise<DesktopPairingSnapshot> {
    return this.exclusive(async () => {
      this.assertActive()
      const authentication = await this.options.account.authorizeCurrentInstallation()
      const stop = enabled ? Promise.resolve() : this.options.relay?.stop('mobile-access-disabled') ?? Promise.resolve()
      const mutation = this.options.transport.setMobileAccess({ authentication, enabled })
      const results = await Promise.allSettled([stop, mutation])
      const stateResult = results[1]
      if (stateResult.status === 'rejected') {
        if (!enabled) this.publish({
          status: 'failed', enabled: false, pairings: [],
          error: stateResult.reason instanceof Error ? stateResult.reason.message : String(stateResult.reason),
        })
        const stopResult = results[0]
        if (stopResult.status === 'rejected') {
          throw new AggregateError(
            [stopResult.reason, stateResult.reason],
            'Desktop Mobile Access update failed',
          )
        }
        throw stateResult.reason
      }
      const state = stateResult.value
      if (!state.enabled) {
        this.publish({ status: 'ready', enabled: false, pairings: [] })
        throwSettled([results[0]])
        return this.snapshot
      }
      throwSettled([results[0]])
      if (state.relay !== undefined) {
        if (this.options.relay?.configure === undefined) {
          throw new Error('Desktop Relay authority has no lifecycle owner')
        }
        await this.options.relay.configure(state.relay)
      }
      await this.refresh()
      return this.snapshot
    })
  }

  async createChallenge(): Promise<DesktopPairingSnapshot> {
    return this.exclusive(async () => {
      this.assertActive()
      try {
        const challenge = await this.options.transport.createChallenge({
          authentication: await this.options.account.authorizeCurrentInstallation(),
          rendezvousId: parsePairingRendezvousId(this.randomId()),
        })
        const pairings = await this.listPairings()
        this.publish({
          status: 'challenge',
          enabled: true,
          challenge: {
            id: challenge.challengeId,
            expiresAt: challenge.expiresAt,
            oneTimeLink: challenge.oneTimeLink,
            qrPayload: challenge.qrPayload,
          },
          pairings,
        })
      } catch (error) {
        this.fail(error)
        throw error
      }
      return this.snapshot
    })
  }

  async cancelChallenge(): Promise<DesktopPairingSnapshot> {
    return this.exclusive(async () => {
      this.assertActive()
      const challenge = this.snapshot.challenge
      if (challenge === undefined) return this.snapshot
      await this.options.transport.cancelChallenge({
        authentication: await this.options.account.authorizeCurrentInstallation(),
        challengeId: parsePairingChallengeId(challenge.id),
      })
      await this.refresh()
      return this.snapshot
    })
  }

  async confirm(pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot> {
    return this.exclusive(async () => {
      this.assertActive()
      await this.options.transport.confirmPairing({
        authentication: await this.options.account.authorizeCurrentInstallation(),
        pendingPairingId,
      })
      await this.refresh()
      return this.snapshot
    })
  }

  async reject(pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot> {
    return this.exclusive(async () => {
      this.assertActive()
      await this.options.transport.rejectPairing({
        authentication: await this.options.account.authorizeCurrentInstallation(),
        pendingPairingId,
      })
      await this.refresh()
      return this.snapshot
    })
  }

  async start(): Promise<void> {
    await this.exclusive(async () => {
      await this.lifecycleBarrier
      if (this.closed) throw new Error('Desktop Personal Pairing is closed')
      const accountId = this.currentAccountId()
      if (this.accountId !== accountId) this.resetAccountScope()
      this.accountId = accountId
      this.active = true
      await this.refresh()
    })
  }

  async deactivate(reason: DesktopRelayStopReason = 'quit'): Promise<void> {
    const generation = ++this.lifecycleGeneration
    this.active = false
    this.resetAccountScope()
    const draining = this.currentOperation ?? this.serial
    const stopping = this.options.relay?.stop(reason) ?? Promise.resolve()
    const settled = Promise.allSettled([stopping, draining])
    this.lifecycleBarrier = settled.then(() => {})
    const results = await settled
    if (this.lifecycleGeneration === generation) this.resetAccountScope()
    throwSettled(results)
  }

  async dispose(): Promise<void> {
    const generation = ++this.lifecycleGeneration
    this.closed = true
    this.active = false
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    const draining = this.currentOperation ?? this.serial
    const stopping = this.options.relay?.stop('quit') ?? Promise.resolve()
    const settled = Promise.allSettled([stopping, draining])
    this.lifecycleBarrier = settled.then(() => {})
    const results = await settled
    if (this.lifecycleGeneration !== generation) return
    this.listeners.clear()
    throwSettled(results)
  }

  private async refresh(): Promise<void> {
    try {
      const state = await this.options.transport.getMobileAccessState(
        await this.options.account.authorizeCurrentInstallation(),
      )
      if (!state.enabled) {
        await this.options.relay?.stop('mobile-access-disabled')
        this.publish({ status: 'ready', enabled: false, pairings: [] })
        return
      }
      await this.options.relay?.start()
      const pending = await this.options.transport.listPendingPairings(
        await this.options.account.authorizeCurrentInstallation(),
      )
      const pairings = await this.listPairings()
      const first = pending[0]
      const challenge = this.snapshot.challenge
      if (first === undefined) {
        this.publish(challenge !== undefined && challenge.expiresAt > this.now()
          ? { status: 'challenge', enabled: true, pairings, challenge }
          : { status: 'ready', enabled: true, pairings })
        return
      }
      this.publish({
        status: 'pending', enabled: true, pairings,
        pending: {
          id: first.pendingPairingId,
          deviceName: first.device.name,
          authenticationWords: first.authenticationWords,
        },
      })
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  private resetAccountScope(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.accountId = undefined
    if (this.snapshot.status === 'ready' && !this.snapshot.enabled && this.snapshot.pairings.length === 0) return
    const snapshot: DesktopPairingSnapshot = { status: 'ready', enabled: false, pairings: [] }
    this.snapshot = snapshot
    this.notify(snapshot)
  }

  private currentAccountId(): PlatformAccountId {
    const snapshot = this.options.account.getSnapshot()
    if (snapshot.status !== 'signed-in' || snapshot.account === undefined) {
      throw new Error('Desktop Personal Pairing requires a signed-in Platform Account')
    }
    return parsePlatformAccountId(snapshot.account.id)
  }

  private async listPairings() {
    const pairings = await this.options.transport.listPersonalPairings(
      await this.options.account.authorizeCurrentInstallation(),
    )
    return pairings.map(pairing => ({
      id: pairing.id,
      deviceName: pairing.device.name,
      platform: pairing.device.platform,
      pairedAt: pairing.pairedAt,
    }))
  }

  private fail(error: unknown): void {
    this.publish({
      status: 'failed',
      enabled: this.snapshot.enabled,
      pairings: this.snapshot.pairings,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  private publish(snapshot: DesktopPairingSnapshot): void {
    if (!this.active || this.closed) return
    this.snapshot = snapshot
    this.updatePolling(snapshot.enabled)
    this.notify(snapshot)
  }

  private notify(snapshot: DesktopPairingSnapshot): void {
    const errors: unknown[] = []
    for (const listener of [...this.listeners]) {
      try { listener(snapshot) } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      console.error('[desktop-personal-pairing] subscriber failures:', new AggregateError(errors))
    }
  }

  private updatePolling(enabled: boolean): void {
    if (!enabled || !this.active || this.closed) {
      if (this.timer !== undefined) clearTimeout(this.timer)
      this.timer = undefined
      return
    }
    if (this.timer !== undefined) return
    this.timer = this.schedule(() => {
      this.timer = undefined
      if (!this.active || this.closed) return
      void this.exclusive(async () => { await this.refresh() }).catch((error: unknown) => {
        console.error('[desktop-personal-pairing] Remote Access refresh failed:', error)
      })
    }, this.pollIntervalMs)
    this.timer.unref()
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation)
    this.currentOperation = result
    this.serial = result.then(() => undefined, () => undefined)
    const release = (): void => {
      if (this.currentOperation === result) this.currentOperation = undefined
    }
    void result.then(release, release)
    return result
  }

  private assertActive(): void {
    if (!this.active || this.closed) throw new Error('Desktop Personal Pairing is inactive')
  }
}

function throwSettled(results: PromiseSettledResult<unknown>[]): void {
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason)
  }
  if (errors.length === 1) throw errorFromUnknown(errors[0])
  if (errors.length > 1) throw new AggregateError(errors, 'Desktop Personal Pairing lifecycle failed')
}

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error), { cause: error })
}

/**
 * Fail-closed controller used until the independently reviewed Noise adapter is available.
 * Mobile Access remains disabled and no invitation capability is created.
 */
export class UnavailableDesktopPairingController implements DesktopPairingActions {
  private readonly snapshot: DesktopPairingSnapshot
  private readonly reason: string

  /** @param reason - exact unavailable reason shown only inside Settings. */
  constructor(reason: string, private readonly relay: DesktopRelayLifecycle = new FailClosedDesktopRelayLifecycle(reason)) {
    this.reason = reason
    this.snapshot = { status: 'unavailable', enabled: false, pairings: [], error: reason }
  }

  getSnapshot(): DesktopPairingSnapshot { return this.snapshot }
  getRelayState(): { connected: boolean; stopReason?: DesktopRelayStopReason } {
    return this.relay.getState?.() ?? { connected: false }
  }
  setEnabled(_enabled: boolean): Promise<DesktopPairingSnapshot> { return this.rejectUnavailable() }
  createChallenge(): Promise<DesktopPairingSnapshot> { return this.rejectUnavailable() }
  cancelChallenge(): Promise<DesktopPairingSnapshot> { return this.rejectUnavailable() }
  confirm(_pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot> { return this.rejectUnavailable() }
  reject(_pendingPairingId: PendingPairingId): Promise<DesktopPairingSnapshot> { return this.rejectUnavailable() }
  subscribe(_listener: (snapshot: DesktopPairingSnapshot) => void): () => void { return () => {} }
  start(): Promise<void> { return Promise.resolve() }
  deactivate(reason: DesktopRelayStopReason = 'quit'): Promise<void> { return this.relay.stop(reason) }
  dispose(): Promise<void> { return this.relay.stop('quit') }

  private rejectUnavailable(): Promise<never> {
    return Promise.reject(new Error(this.reason))
  }
}

/** Parse the renderer-provided Mobile Access value at the Electron IPC boundary. */
export function parsePairingEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Desktop pairing enabled must be boolean')
  return value
}

/** Parse a renderer-provided Pending Pairing id at the Electron IPC boundary. */
export function parseDesktopPendingPairingId(value: unknown): PendingPairingId {
  return parsePendingPairingId(value)
}

/** Validate an IPC value before invoking the Mobile Access mutation. */
export function setPairingEnabledFromIpc(
  actions: Pick<DesktopPairingActions, 'setEnabled'>,
  value: unknown,
): Promise<DesktopPairingSnapshot> {
  return actions.setEnabled(parsePairingEnabled(value))
}

/** Validate an IPC id before invoking the Desktop confirmation mutation. */
export function confirmPairingFromIpc(
  actions: Pick<DesktopPairingActions, 'confirm'>,
  value: unknown,
): Promise<DesktopPairingSnapshot> {
  return actions.confirm(parseDesktopPendingPairingId(value))
}

/** Validate an IPC id before invoking the Desktop rejection mutation. */
export function rejectPairingFromIpc(
  actions: Pick<DesktopPairingActions, 'reject'>,
  value: unknown,
): Promise<DesktopPairingSnapshot> {
  return actions.reject(parseDesktopPendingPairingId(value))
}
