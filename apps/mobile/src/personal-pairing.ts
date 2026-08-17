/** Signed-in Mobile Personal Pairing controller over the public Remote Access transport. */

import type { PairingCompletionId, PendingPairingId } from '@deepseek-ai/dsh-remote-access'
import type { PlatformAccountInstallation } from '@deepseek-ai/dsh-platform-account-client'
import type { RemoteAccessTransport } from '@deepseek-ai/dsh-remote-access-client'
import type { MobilePairingActions, MobilePairingSnapshot } from './MobilePairing.tsx'

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
}

/** Real signed-in Mobile controller; no short-code path exists. */
export class MobilePairingController implements MobilePairingActions {
  private snapshot: MobilePairingSnapshot = { status: 'ready' }
  private readonly listeners = new Set<() => void>()
  private serial: Promise<void> = Promise.resolve()
  private readonly schedule: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  private readonly pollIntervalMs: number
  private timer: ReturnType<typeof setTimeout> | undefined

  /** @param options - Account authority, Remote Access transport, reviewed handshake, and QR scanner. */
  constructor(private readonly options: MobilePairingControllerOptions) {
    this.schedule = options.schedule ?? ((task, delayMs) => setTimeout(task, delayMs))
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new TypeError('Mobile Pairing poll interval must be a positive integer')
    }
  }

  getSnapshot(): MobilePairingSnapshot { return this.snapshot }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async completeLink(link: string): Promise<void> {
    await this.exclusive(async () => {
      this.publish({ status: 'completing' })
      try {
        const prepared = await this.options.handshake.begin(link)
        const completion = await this.options.transport.completeChallenge({
          authentication: await this.options.installation.authorizeCurrentInstallation(),
          completionId: prepared.completionId,
          oneTimeLink: link,
          device: this.options.device,
          mobileHandshake: prepared.mobileHandshake,
        })
        await this.options.handshake.acceptDesktopHandshake(completion.desktopHandshake)
        this.publish({
          status: 'pending',
          deviceName: this.options.device.name,
          authenticationWords: completion.authenticationWords,
        })
        this.scheduleStatus(completion.pendingPairingId)
      } catch (error) {
        this.publish({ status: 'unavailable', error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    })
  }

  async scanQr(): Promise<void> {
    const payload = await this.options.scanner.scan()
    await this.completeLink(payload)
  }

  private publish(snapshot: MobilePairingSnapshot): void {
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
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = this.schedule(() => {
      this.timer = undefined
      void this.exclusive(async () => {
        try {
          const status = await this.options.transport.getMobilePairingStatus({
            authentication: await this.options.installation.authorizeCurrentInstallation(),
            pendingPairingId,
          })
          if (status.status === 'pending') {
            this.scheduleStatus(pendingPairingId)
          } else if (status.status === 'paired') {
            this.publish({ status: 'paired' })
          } else {
            this.publish({ status: 'unavailable', error: 'Desktop rejected Personal Pairing.' })
          }
        } catch (error) {
          this.publish({ status: 'unavailable', error: error instanceof Error ? error.message : String(error) })
        }
      })
    }, this.pollIntervalMs)
  }

  private exclusive(operation: () => Promise<void>): Promise<void> {
    const result = this.serial.then(operation)
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }
}
