/** Signed-in Mobile Personal Pairing controller over the public Remote Access transport. */

import {
  RemoteAccessError,
  parsePairingInvitationLink,
  type PairingCompletionId,
  type PairingCompletionView,
  type PendingPairingId,
} from '@deepseek-ai/dsh-remote-access'
import type { PlatformAccountInstallation } from '@deepseek-ai/dsh-platform-account-client'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import type { MobilePairingActions, MobilePairingSnapshot } from './personal-pairing-model.ts'

/** Mobile handshake half selected by the reviewed product composition. */
export interface MobilePairingHandshakeClient {
  /** Prepare one Mobile handshake message and id for the complete invitation. */
  begin(oneTimeLink: string): Promise<{ completionId: PairingCompletionId; mobileHandshake: Uint8Array }>
  /** Consume the Desktop handshake response before exposing authentication words. */
  acceptDesktopHandshake(desktopHandshake: Uint8Array): Promise<void>
}

/** Native QR scanner returning the exact full invitation payload. */
interface MobilePairingQrScanner {
  /** @returns exact full invitation payload from the native scanner. */
  scan(): Promise<string>
}

interface PreparedMobilePairingAttempt {
  link: string
  expiresAt: number
  completionId: PairingCompletionId
  mobileHandshake: Uint8Array
  pendingProjection?: PairingCompletionView
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
  installation: Pick<PlatformAccountInstallation, 'authorizeCurrentInstallation'>
  transport: RemoteAccessTransport
  handshake: MobilePairingHandshakeClient
  scanner: MobilePairingQrScanner
  device: { name: string; platform: 'ios' | 'android' }
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
  private active = true

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
    await this.serial
    this.active = true
  }

  async deactivate(): Promise<void> {
    this.active = false
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    await this.serial
  }

  async completeLink(link: string): Promise<void> {
    await this.exclusive(async () => {
      const retained = this.currentAttempt()
      if (retained !== undefined && retained.link !== link) {
        throw new Error('Retry the retained Personal Pairing attempt before using another invitation')
      }
      const attempt = retained ?? await this.prepareAttempt(link)
      await this.runAttempt(attempt)
    })
  }

  async scanQr(): Promise<void> {
    const payload = await this.options.scanner.scan()
    await this.completeLink(payload)
  }

  async retryPairing(): Promise<void> {
    await this.exclusive(async () => {
      const attempt = this.currentAttempt()
      if (attempt === undefined) throw new Error('No retryable Personal Pairing attempt is available')
      await this.runAttempt(attempt)
    })
  }

  private async prepareAttempt(link: string): Promise<PreparedMobilePairingAttempt> {
    const invitation = parsePairingInvitationLink(link)
    if (this.now() >= invitation.expiresAt) throw new Error('Personal Pairing invitation expired')
    const prepared = await this.options.handshake.begin(link)
    const attempt = {
      link,
      expiresAt: invitation.expiresAt,
      completionId: prepared.completionId,
      mobileHandshake: prepared.mobileHandshake,
    }
    this.attempt = attempt
    return attempt
  }

  private async runAttempt(attempt: PreparedMobilePairingAttempt): Promise<void> {
    this.publish({ status: 'completing' })
    try {
      const completion = await this.options.transport.completeChallenge({
        authentication: await this.options.installation.authorizeCurrentInstallation(),
        completionId: attempt.completionId,
        oneTimeLink: attempt.link,
        device: this.options.device,
        mobileHandshake: attempt.mobileHandshake,
      })
      this.assertActive()
      attempt.pendingProjection = completion
      await this.options.handshake.acceptDesktopHandshake(completion.desktopHandshake)
      this.assertActive()
      this.publish({
        status: 'pending',
        deviceName: this.options.device.name,
        authenticationWords: completion.authenticationWords,
      })
      this.scheduleStatus(completion.pendingPairingId)
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

  private currentAttempt(): PreparedMobilePairingAttempt | undefined {
    const attempt = this.attempt
    if (attempt === undefined) return undefined
    if (this.now() < attempt.expiresAt) return attempt
    this.clearAttempt()
    this.publish({ status: 'ready', error: 'Personal Pairing invitation expired' })
    return undefined
  }

  private isTerminal(error: unknown, attempt: PreparedMobilePairingAttempt): boolean {
    if (this.now() >= attempt.expiresAt) return true
    return error instanceof RemoteAccessError
  }

  private clearAttempt(): void {
    this.attempt = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
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
      await operation()
    })
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }

  private assertActive(): void {
    if (!this.active) throw new Error('Mobile Personal Pairing is inactive')
  }
}
