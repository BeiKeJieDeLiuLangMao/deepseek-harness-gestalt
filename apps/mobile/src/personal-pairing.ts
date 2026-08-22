/** Signed-in Mobile Personal Pairing controller over the public Remote Access transport. */

import {
  PAIRING_REPLAY_RETENTION_MS,
  RemoteAccessError,
  deriveAuthenticationWords,
  parsePairingChallengeId,
  parsePairingInvitationLink,
  type PairingCompletionId,
  type PairingCompletionView,
  type PendingPairingId,
  type PersonalPairingId,
  type RelayCredentialGrant,
} from '@deepseek-ai/dsh-remote-access'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { PlatformAccountInstallation } from '@deepseek-ai/dsh-platform-account-client'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import type { MobilePairingActions, MobilePairingSnapshot } from './personal-pairing-model.ts'

/** Process-owned foreground Relay lifecycle released on unpair and Account change. */
interface MobilePairingLifecycleOwner {
  forgetConnection(): void
  releasePairing(): Promise<void>
}

/** Mobile handshake half selected by the reviewed product composition. */
export interface MobilePairingHandshakeClient {
  /** Prepare one Mobile handshake message and id for the complete invitation. */
  begin(oneTimeLink: string): Promise<{ completionId: PairingCompletionId; mobileHandshake: Uint8Array }>
  /** Prepare Mobile XKpsk3 message 1 from an endpoint-owned opaque invitation. */
  beginEndpointInvitation?(invitationPayload: Uint8Array): Promise<Uint8Array>
  /** Consume the Desktop handshake response before exposing authentication words. */
  acceptDesktopHandshake(desktopHandshake: Uint8Array): Promise<void>
  /** @returns Mobile message 3 for a three-message handshake, or undefined for development keyless pairing. */
  exportFinishMessage?(): Uint8Array | undefined
  /** @returns public completed XKpsk3 authentication hash. */
  exportAuthenticationHash?(): Uint8Array
  /** Open Mobile-specific Relay authority sealed to this Personal Pairing. */
  openRelayAuthority?(sealedAuthority: Uint8Array): Promise<RelayCredentialGrant>
  /** Open and persist one-shot authority before invitation state is erased. */
  openRelayAuthorityDurably?(
    sealedAuthority: Uint8Array,
    persist: (grant: RelayCredentialGrant, reconnectState: Uint8Array) => Promise<void>,
  ): Promise<RelayCredentialGrant>
  /** @returns endpoint-local XKpsk3 crash recovery before confirmation settles. */
  exportRecoveryState?(): Uint8Array
  /** Restore endpoint-local XKpsk3 state after process restart. */
  restoreRecoveryState?(recovery: Uint8Array): void
  /**
   * Export the independent pairing key retained after the Desktop handshake.
   * @returns copy of at least 32 bytes, or undefined before activation.
   */
  exportPairingKeyMaterial?(): Uint8Array | undefined
  /** @returns Mobile static reconnect state after opening Relay authority. */
  exportReconnectState?(): Uint8Array
  /** Wipe any retained pairing key material on this installation. */
  wipe?(): void | Promise<void>
}

/** Retention sink for confirmed Personal Pairing key material. */
export interface MobilePairingKeyRetention {
  /**
   * Retain the independent key material of one confirmed Personal Pairing.
   * @param pairingId - confirmed Personal Pairing identity.
   * @param material - at least 32 bytes of pairing key material.
   */
  retain(pairingId: PersonalPairingId, material: Uint8Array): void
  /** Atomically retain reconnect state and its Mobile Relay authority. */
  retainConfirmedPairing?(pairingId: PersonalPairingId, material: Uint8Array, grant: RelayCredentialGrant): void
  /** Select and load one signed-in Account scope before Relay attachment. */
  selectAccount?(accountId: PlatformAccountId): Promise<void>
  /** Retain the Mobile-only Relay grant beside its reconnect state. */
  retainRelayAuthority?(pairingId: PersonalPairingId, grant: RelayCredentialGrant): void
  /** @returns latest retained Mobile Relay grant for this Account. */
  relayAuthority?(): RelayCredentialGrant | undefined
  /** Persist one in-flight endpoint pairing before its next external effect. */
  retainEndpointRecovery?(recovery: MobileEndpointPairingRecovery): void
  /** @returns an Account-scoped endpoint pairing recovery copy. */
  endpointRecovery?(): MobileEndpointPairingRecovery | undefined
  /** Remove settled or rejected endpoint recovery. */
  clearEndpointRecovery?(): void
  /** Wait until queued durable writes settle. */
  flush?(): Promise<void>
  /** Zero every retained pairing key. */
  wipe(): void
}

/** Account-scoped Mobile crash recovery for one endpoint-owned pairing transaction. */
export interface MobileEndpointPairingRecovery {
  link: string
  expiresAt: number
  accountId: PlatformAccountId
  completionId: PairingCompletionId
  mobileHandshake: Uint8Array
  transmission: PreparedMobilePairingAttempt['transmission']
  endpointChallengeId: ReturnType<typeof parsePairingChallengeId>
  handshakeRecovery: Uint8Array
  replayExpiresAt?: number
  endpointHandshakeFinished: boolean
}

/** Native QR scanner returning the exact full invitation payload. */
interface MobilePairingQrScanner {
  /** @returns exact full invitation payload from the native scanner. */
  scan(): Promise<string>
}

interface PreparedMobilePairingAttempt {
  link: string
  expiresAt: number
  accountId: PlatformAccountId
  completionId: PairingCompletionId
  mobileHandshake: Uint8Array
  transmission: 'prepared' | 'possibly-committed' | 'pending'
  endpointChallengeId?: ReturnType<typeof parsePairingChallengeId>
  endpointHandshakeFinished?: boolean
  replayExpiresAt?: number
  pendingProjection?: PairingCompletionView
  confirmed?: {
    pairingId: PersonalPairingId
    sealedRelayAuthority: Uint8Array
    reconnectState: Uint8Array
    grant: RelayCredentialGrant
    persisted: boolean
  }
}

declare global {
  interface Window {
    /** Native shell hook returning the exact QR payload without text reconstruction. */
    dshMobileScanPairingQr?: () => Promise<string>
  }
}

/** QR scanner bridge supplied by the native Mobile shell. */
export class NativeMobilePairingQrScanner implements MobilePairingQrScanner {
  async scan(): Promise<string> {
    const scan = window.dshMobileScanPairingQr
    if (scan === undefined) throw new Error('Native Personal Pairing QR scanner is unavailable')
    const payload = await scan()
    if (payload === '') throw new TypeError('Personal Pairing QR payload must be non-empty')
    return payload
  }
}

/** Mobile controller construction inputs. */
export interface MobilePairingControllerOptions {
  installation: Pick<PlatformAccountInstallation, 'authorizeCurrentInstallation' | 'getSnapshot'>
  transport: RemoteAccessTransport
  handshake: MobilePairingHandshakeClient
  scanner: MobilePairingQrScanner
  device: { name: string; platform: 'ios' | 'android' }
  /** Product Relay lifecycle receiving only Mobile-specific authority. */
  relay?: {
    configure(grant?: RelayCredentialGrant): void | Promise<void>
    start(): Promise<void>
    stop(): Promise<void>
  }
  /** Process-owned foreground Relay lifecycle. */
  companion?: MobilePairingLifecycleOwner
  /** Optional retention sink receiving confirmed pairing key material for pairing-scoped consumers. */
  pairingKeys?: MobilePairingKeyRetention
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  pollIntervalMs?: number
  now?: () => number
}

/** Real signed-in Mobile controller; no short-code path exists. */
export class MobilePairingController implements MobilePairingActions {
  private snapshot: MobilePairingSnapshot = { status: 'ready' }
  private readonly listeners = new Set<() => void>()
  private serial: Promise<void> = Promise.resolve()
  private readonly schedule: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  private readonly pollIntervalMs: number
  private readonly now: () => number
  private timer: ReturnType<typeof setTimeout> | undefined
  private attempt: PreparedMobilePairingAttempt | undefined
  private accountId: PlatformAccountId | undefined
  private active = true
  private lifecycleBarrier: Promise<void> = Promise.resolve()

  /** @param options - Account authority, Remote Access transport, reviewed handshake, and QR scanner. */
  constructor(private readonly options: MobilePairingControllerOptions) {
    this.schedule = options.schedule ?? ((task, delayMs) => setTimeout(task, delayMs))
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    this.now = options.now ?? Date.now
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new TypeError('Mobile Pairing poll interval must be a positive integer')
    }
  }

  getSnapshot(): MobilePairingSnapshot { return this.snapshot }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async activate(): Promise<void> {
    await this.lifecycleBarrier
    await this.serial
    const accountId = this.currentAccountId()
    if (this.accountId !== accountId) this.resetAccountScope()
    this.accountId = accountId
    await this.options.pairingKeys?.selectAccount?.(accountId)
    this.active = true
    const recovery = this.options.pairingKeys?.endpointRecovery?.()
    if (recovery !== undefined) {
      if (recovery.accountId !== accountId || this.now() >= (recovery.replayExpiresAt ?? recovery.expiresAt)) {
        recovery.mobileHandshake.fill(0)
        recovery.handshakeRecovery.fill(0)
        this.options.pairingKeys?.clearEndpointRecovery?.()
        await this.options.pairingKeys?.flush?.()
      } else {
        if (this.options.handshake.restoreRecoveryState === undefined) {
          throw new Error('Mobile endpoint pairing recovery has no handshake owner')
        }
        this.options.handshake.restoreRecoveryState(recovery.handshakeRecovery)
        recovery.handshakeRecovery.fill(0)
        const restoredAttempt: PreparedMobilePairingAttempt = {
          link: recovery.link, expiresAt: recovery.expiresAt, accountId: recovery.accountId,
          completionId: recovery.completionId, mobileHandshake: recovery.mobileHandshake,
          transmission: recovery.transmission, endpointChallengeId: recovery.endpointChallengeId,
          ...(recovery.replayExpiresAt === undefined ? {} : { replayExpiresAt: recovery.replayExpiresAt }),
          endpointHandshakeFinished: recovery.endpointHandshakeFinished,
        }
        this.attempt = restoredAttempt
        if (recovery.transmission === 'pending') this.scheduleEndpointStatus(recovery.completionId)
        else await this.runAttempt(restoredAttempt)
      }
    }
    const restoredGrant = this.options.pairingKeys?.relayAuthority?.()
    if (restoredGrant !== undefined && this.options.relay !== undefined) {
      await this.options.relay.configure(restoredGrant)
      await this.options.relay.start()
    }
  }

  async unpair(): Promise<void> {
    await this.exclusive(async () => {
      this.assertActiveAccount()
      this.attempt?.mobileHandshake.fill(0)
      this.clearAttempt()
      await this.options.handshake.wipe?.()
      this.options.pairingKeys?.wipe()
      await this.options.pairingKeys?.flush?.()
      if (this.options.companion !== undefined) {
        await this.options.companion.releasePairing()
      }
      if (this.options.relay !== this.options.companion) {
        await this.options.relay?.configure(undefined)
        await this.options.relay?.stop()
      }
      this.publish({ status: 'ready' })
    })
  }

  async deactivate(): Promise<void> {
    this.active = false
    this.resetAccountScope()
    const transaction = (async () => {
      const first = await Promise.allSettled([this.options.relay?.stop() ?? Promise.resolve(), this.serial])
      const final = await Promise.allSettled([this.options.relay?.stop() ?? Promise.resolve()])
      this.resetAccountScope()
      throwRejected([...first, ...final], 'Mobile Personal Pairing deactivation failed')
    })()
    this.lifecycleBarrier = transaction.then(() => undefined, () => undefined)
    await transaction
  }

  async completeLink(link: string): Promise<void> {
    await this.exclusive(async () => { await this.completeLinkOwned(link) })
  }

  async scanQr(): Promise<void> {
    await this.exclusive(async () => {
      const payload = await this.options.scanner.scan()
      this.assertActiveAccount()
      await this.completeLinkOwned(payload)
    })
  }

  async retryPairing(): Promise<void> {
    await this.exclusive(async () => {
      const attempt = this.currentAttempt()
      if (attempt === undefined) throw new Error('No retryable Personal Pairing attempt is available')
      await this.runAttempt(attempt)
    })
  }

  private async prepareAttempt(link: string): Promise<PreparedMobilePairingAttempt> {
    const endpoint = parseEndpointInvitation(link)
    if (endpoint !== undefined) {
      if (this.now() >= endpoint.expiresAt) throw new Error('Personal Pairing invitation expired')
      if (this.options.handshake.beginEndpointInvitation === undefined) {
        throw new Error('Endpoint-owned Personal Pairing handshake is unavailable')
      }
      const message1 = await this.options.handshake.beginEndpointInvitation(endpoint.payload)
      const attempt: PreparedMobilePairingAttempt = {
        link, expiresAt: endpoint.expiresAt, accountId: this.requireAccountId(),
        completionId: `snow-${crypto.randomUUID()}` as PairingCompletionId,
        mobileHandshake: message1, transmission: 'prepared', endpointChallengeId: endpoint.challengeId,
      }
      this.attempt = attempt
      await this.checkpointEndpointAttempt(attempt)
      return attempt
    }
    const invitation = parsePairingInvitationLink(link)
    if (this.now() >= invitation.expiresAt) throw new Error('Personal Pairing invitation expired')
    const prepared = await this.options.handshake.begin(link)
    const attempt = {
      link,
      expiresAt: invitation.expiresAt,
      accountId: this.requireAccountId(),
      completionId: prepared.completionId,
      mobileHandshake: prepared.mobileHandshake,
      transmission: 'prepared' as const,
    }
    this.attempt = attempt
    return attempt
  }

  private async runAttempt(attempt: PreparedMobilePairingAttempt): Promise<void> {
    this.publish({ status: 'completing' })
    try {
      const authentication = await this.options.installation.authorizeCurrentInstallation()
      this.assertActiveAccount()
      attempt.transmission = 'possibly-committed'
      attempt.replayExpiresAt = this.now() + PAIRING_REPLAY_RETENTION_MS
      if (attempt.endpointChallengeId !== undefined) {
        await this.checkpointEndpointAttempt(attempt)
        const pending = await this.options.transport.submitEndpointMessage1({
          authentication, challengeId: attempt.endpointChallengeId, completionId: attempt.completionId,
          device: this.options.device, message1: attempt.mobileHandshake,
        })
        this.assertActiveAccount()
        attempt.transmission = 'pending'
        await this.checkpointEndpointAttempt(attempt)
        this.publish({ status: 'completing' })
        this.scheduleEndpointStatus(attempt.completionId)
        void pending
        return
      }
      const completion = await this.options.transport.completeChallenge({
        authentication,
        completionId: attempt.completionId,
        oneTimeLink: attempt.link,
        device: this.options.device,
        mobileHandshake: attempt.mobileHandshake,
      })
      this.assertActiveAccount()
      attempt.pendingProjection = completion
      attempt.transmission = 'pending'
      await this.options.handshake.acceptDesktopHandshake(completion.desktopHandshake)
      this.assertActiveAccount()
      const mobileFinish = this.options.handshake.exportFinishMessage?.()
      let finished = completion
      if (mobileFinish !== undefined) {
        try {
          finished = await this.options.transport.finishChallenge({
            authentication: await this.options.installation.authorizeCurrentInstallation(),
            pendingPairingId: completion.pendingPairingId,
            mobileFinish,
          })
        } finally {
          mobileFinish.fill(0)
        }
      }
      this.assertActiveAccount()
      attempt.pendingProjection = finished
      this.publish({
        status: 'pending',
        deviceName: this.options.device.name,
        authenticationWords: finished.authenticationWords,
      })
      this.scheduleStatus(finished.pendingPairingId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (this.isTerminal(error, attempt)) {
        this.clearAttempt()
        this.publish({ status: 'ready', error: message })
      } else {
        this.publish({ status: 'retryable', error: message })
      }
      throw error
    }
  }

  private scheduleEndpointStatus(completionId: PairingCompletionId): void {
    if (!this.active) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = this.schedule(() => {
      this.timer = undefined
      if (!this.active) return
      void this.exclusive(async () => {
        try {
          const authentication = await this.options.installation.authorizeCurrentInstallation()
          const status = await this.options.transport.getEndpointPairingStatus({ authentication, completionId })
          this.assertActiveAccount()
          if (status.stage === 'awaiting-desktop' || status.stage === 'awaiting-authority') {
            this.scheduleEndpointStatus(completionId)
            return
          }
          if (status.stage === 'message2') {
            const attempt = this.currentAttempt()
            if (attempt === undefined) throw new Error('Mobile Personal Pairing has no retained endpoint attempt')
            if (!attempt.endpointHandshakeFinished) {
              await this.options.handshake.acceptDesktopHandshake(status.message2)
              attempt.endpointHandshakeFinished = true
              await this.checkpointEndpointAttempt(attempt)
            }
            const message3 = this.options.handshake.exportFinishMessage?.()
            const hash = this.options.handshake.exportAuthenticationHash?.()
            if (message3 === undefined || hash === undefined) {
              throw new Error('Endpoint-owned Personal Pairing did not complete XKpsk3')
            }
            try {
              await this.options.transport.submitEndpointMessage3({ authentication, completionId, message3 })
            } finally {
              message3.fill(0)
            }
            this.publish({
              status: 'pending', deviceName: this.options.device.name,
              authenticationWords: deriveAuthenticationWords(hash),
            })
            hash.fill(0)
            this.scheduleEndpointStatus(completionId)
            return
          }
          if (status.stage === 'rejected') {
            this.clearAttempt()
            this.publish({ status: 'unavailable', error: 'Desktop rejected Personal Pairing.' })
            return
          }
          if ((this.options.handshake.openRelayAuthority === undefined
            && this.options.handshake.openRelayAuthorityDurably === undefined) || this.options.relay === undefined) {
            throw new Error('Mobile Relay authority has no product lifecycle owner')
          }
          const attempt = this.currentAttempt()
          if (attempt === undefined) throw new Error('Mobile Personal Pairing has no retained confirmation attempt')
          const confirmed = await this.prepareConfirmedEndpointAttempt(
            attempt, status.pairingId, status.sealedRelayAuthority,
          )
          if (!confirmed.persisted) {
            if (this.options.pairingKeys?.retainConfirmedPairing !== undefined) {
              this.options.pairingKeys.retainConfirmedPairing(
                confirmed.pairingId, confirmed.reconnectState, confirmed.grant,
              )
            } else {
              this.options.pairingKeys?.retain(confirmed.pairingId, confirmed.reconnectState)
              this.options.pairingKeys?.retainRelayAuthority?.(confirmed.pairingId, confirmed.grant)
            }
            await this.options.pairingKeys?.flush?.()
            confirmed.persisted = true
          }
          await this.options.relay.configure(confirmed.grant)
          await this.options.relay.start()
          this.clearAttempt()
          this.publish({ status: 'paired' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const attempt = this.attempt
          if (attempt === undefined || this.isTerminal(error, attempt)) {
            this.clearAttempt()
            this.publish({ status: 'ready', error: message })
          } else {
            this.publish({ status: 'retryable', error: message })
          }
        }
      })
    }, this.pollIntervalMs)
    this.timer.unref()
  }

  private currentAttempt(): PreparedMobilePairingAttempt | undefined {
    const attempt = this.attempt
    if (attempt === undefined) return undefined
    if (attempt.accountId !== this.requireAccountId()) {
      this.resetAccountScope()
      return undefined
    }
    if (attempt.transmission === 'pending') return attempt
    const expiresAt = attempt.transmission === 'possibly-committed'
      ? attempt.replayExpiresAt ?? attempt.expiresAt
      : attempt.expiresAt
    if (this.now() < expiresAt) return attempt
    this.clearAttempt()
    this.publish({ status: 'ready', error: 'Personal Pairing invitation expired' })
    return undefined
  }

  private isTerminal(error: unknown, attempt: PreparedMobilePairingAttempt): boolean {
    return error instanceof RemoteAccessError
      || (attempt.transmission === 'prepared' && this.now() >= attempt.expiresAt)
  }

  private clearAttempt(): void {
    this.attempt?.mobileHandshake.fill(0)
    this.attempt?.confirmed?.sealedRelayAuthority.fill(0)
    this.attempt?.confirmed?.reconnectState.fill(0)
    this.attempt = undefined
    this.options.pairingKeys?.clearEndpointRecovery?.()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private async prepareConfirmedEndpointAttempt(
    attempt: PreparedMobilePairingAttempt,
    pairingId: PersonalPairingId,
    sealedRelayAuthority: Uint8Array,
  ): Promise<NonNullable<PreparedMobilePairingAttempt['confirmed']>> {
    const retained = attempt.confirmed
    if (retained !== undefined) {
      if (retained.pairingId !== pairingId || !sameBytes(retained.sealedRelayAuthority, sealedRelayAuthority)) {
        throw new Error('Confirmed Personal Pairing changed during Mobile retry')
      }
      return retained
    }
    let durableReconnectState: Uint8Array | undefined
    const durableOpen = this.options.handshake.openRelayAuthorityDurably
    const retainConfirmed = this.options.pairingKeys?.retainConfirmedPairing
    const grant = durableOpen === undefined || retainConfirmed === undefined
      ? await this.options.handshake.openRelayAuthority?.(sealedRelayAuthority)
      : await durableOpen.call(this.options.handshake, sealedRelayAuthority, async (openedGrant, reconnectState) => {
        durableReconnectState = reconnectState.slice()
        retainConfirmed.call(this.options.pairingKeys, pairingId, reconnectState, openedGrant)
        await this.options.pairingKeys?.flush?.()
      })
    if (grant === undefined) throw new Error('Mobile Relay authority has no product lifecycle owner')
    const reconnectState = durableReconnectState ?? this.options.handshake.exportReconnectState?.()
    if (reconnectState === undefined) throw new Error('Mobile Snow reconnect state is unavailable')
    attempt.confirmed = {
      pairingId,
      sealedRelayAuthority: sealedRelayAuthority.slice(),
      reconnectState: reconnectState.slice(),
      grant: { ...grant },
      persisted: durableReconnectState !== undefined,
    }
    reconnectState.fill(0)
    return attempt.confirmed
  }

  private completeLinkOwned(link: string): Promise<void> {
    const retained = this.currentAttempt()
    if (retained !== undefined && retained.link !== link) {
      throw new Error('Retry the retained Personal Pairing attempt before using another invitation')
    }
    return (async () => {
      const attempt = retained ?? await this.prepareAttempt(link)
      await this.runAttempt(attempt)
    })()
  }

  private resetAccountScope(): void {
    this.attempt?.mobileHandshake.fill(0)
    this.attempt?.confirmed?.sealedRelayAuthority.fill(0)
    this.attempt?.confirmed?.reconnectState.fill(0)
    this.attempt = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.options.companion?.forgetConnection()
    if (this.options.companion !== undefined) {
      void this.options.companion.releasePairing()
    }
    if (this.options.relay !== this.options.companion) {
      void this.options.relay?.configure(undefined)
    }
    this.accountId = undefined
    this.snapshot = { status: 'ready' }
  }

  private currentAccountId(): PlatformAccountId {
    const snapshot = this.options.installation.getSnapshot()
    if (snapshot.status !== 'signed-in' || snapshot.account === undefined) {
      throw new Error('Mobile Personal Pairing requires a signed-in Platform Account')
    }
    return snapshot.account.id
  }

  private requireAccountId(): PlatformAccountId {
    const current = this.currentAccountId()
    if (this.accountId === undefined) this.accountId = current
    if (this.accountId !== current) throw new Error('Mobile Personal Pairing Account changed')
    return current
  }

  private publish(snapshot: MobilePairingSnapshot): void {
    if (!this.active) return
    this.snapshot = snapshot
    const errors: unknown[] = []
    for (const listener of [...this.listeners]) {
      try { listener() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      console.error('[mobile-personal-pairing] subscriber failures:', new AggregateError(errors))
    }
  }

  private async checkpointEndpointAttempt(attempt: PreparedMobilePairingAttempt): Promise<void> {
    if (attempt.endpointChallengeId === undefined) return
    if (this.options.handshake.exportRecoveryState === undefined
      || this.options.pairingKeys?.retainEndpointRecovery === undefined) {
      throw new Error('Mobile endpoint pairing has no durable recovery owner')
    }
    const handshakeRecovery = this.options.handshake.exportRecoveryState()
    try {
      await this.options.pairingKeys.selectAccount?.(attempt.accountId)
      this.options.pairingKeys.retainEndpointRecovery({
        link: attempt.link, expiresAt: attempt.expiresAt, accountId: attempt.accountId,
        completionId: attempt.completionId, mobileHandshake: attempt.mobileHandshake,
        transmission: attempt.transmission, endpointChallengeId: attempt.endpointChallengeId,
        handshakeRecovery,
        ...(attempt.replayExpiresAt === undefined ? {} : { replayExpiresAt: attempt.replayExpiresAt }),
        endpointHandshakeFinished: attempt.endpointHandshakeFinished ?? false,
      })
      await this.options.pairingKeys.flush?.()
    } finally { handshakeRecovery.fill(0) }
  }

  private scheduleStatus(pendingPairingId: PendingPairingId): void {
    if (!this.active) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = this.schedule(() => {
      this.timer = undefined
      if (!this.active) return
      void this.exclusive(async () => {
        try {
          const status = await this.options.transport.getMobilePairingStatus({
            authentication: await this.options.installation.authorizeCurrentInstallation(),
            pendingPairingId,
          })
          if (status.status === 'pending') {
            this.scheduleStatus(pendingPairingId)
          } else if (status.status === 'paired') {
            if (this.options.pairingKeys !== undefined) {
              if (this.options.handshake.exportPairingKeyMaterial === undefined) {
                throw new Error('Mobile Pairing handshake cannot export pairing key material')
              }
              const material = this.options.handshake.exportPairingKeyMaterial()
              if (material === undefined) {
                throw new Error('Mobile Pairing handshake exported no pairing key material')
              }
              this.options.pairingKeys.retain(status.pairingId, material)
              material.fill(0)
            }
            if (status.sealedRelayAuthority !== undefined) {
              if (this.options.handshake.openRelayAuthority === undefined || this.options.relay === undefined) {
                throw new Error('Mobile Relay authority has no product lifecycle owner')
              }
              const grant = await this.options.handshake.openRelayAuthority(status.sealedRelayAuthority)
              this.assertActiveAccount()
              await this.options.relay.configure(grant)
              this.assertActiveAccount()
              await this.options.relay.start()
              this.assertActiveAccount()
            }
            this.clearAttempt()
            this.publish({ status: 'paired' })
          } else {
            this.clearAttempt()
            this.publish({ status: 'unavailable', error: 'Desktop rejected Personal Pairing.' })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const attempt = this.attempt
          if (attempt === undefined || this.isTerminal(error, attempt)) {
            this.clearAttempt()
            this.publish({ status: 'ready', error: message })
          } else {
            this.publish({ status: 'retryable', error: message })
          }
        }
      })
    }, this.pollIntervalMs)
  }

  private exclusive(operation: () => Promise<void>): Promise<void> {
    const result = this.serial.then(async () => {
      this.assertActive()
      this.requireAccountId()
      await operation()
    })
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }

  private assertActive(): void {
    if (!this.active) throw new Error('Mobile Personal Pairing is inactive')
  }

  private assertActiveAccount(): void {
    this.assertActive()
    this.requireAccountId()
  }
}

function parseEndpointInvitation(link: string): {
  challengeId: ReturnType<typeof parsePairingChallengeId>
  expiresAt: number
  payload: Uint8Array
} | undefined {
  const url = new URL(link)
  const encoded = url.searchParams.get('payload')
  if (encoded === null) return undefined
  const expiresAt = Number(url.searchParams.get('expires'))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new TypeError('Endpoint Pairing invitation expiry is invalid')
  }
  if (url.searchParams.get('protocol') !== '1') {
    throw new TypeError('Endpoint Pairing invitation protocol is unsupported')
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new TypeError('Endpoint Pairing invitation payload must be canonical base64url')
  }
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4))
  const payload = Uint8Array.from(binary, value => value.charCodeAt(0))
  return {
    challengeId: parsePairingChallengeId(url.searchParams.get('challenge')),
    expiresAt,
    payload,
  }
}

function throwRejected(results: PromiseSettledResult<unknown>[], message: string): void {
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown)
  if (errors.length > 0) throw new AggregateError(errors, message)
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}
