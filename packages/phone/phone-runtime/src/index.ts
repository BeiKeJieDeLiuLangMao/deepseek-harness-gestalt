/** Cordis facade for pool-owned mobilecli generations. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveValidatedConfig, MobilecliPhoneRuntime, type MobilecliGeneration, type GenerationPublication } from './mobilecli-phone-runtime.ts'
import { createPhoneRuntimePool, type PhoneRuntimePool, type PhoneRuntimeHandle } from './runtime-pool.ts'
import {
  PHONE_RUNTIME_STATE_OWNER,
  registerPhoneRuntimeStateReader,
  phoneRuntimeStateValidator,
  type PhoneRuntimeStateOwner,
} from './runtime-state.ts'
import { resolveMobilecliExecutable } from './resolve-binary.ts'
import { PhoneDevicesError, phoneFailureWithCleanup } from './errors.ts'
import type {
  DeviceId, PhoneDeviceChange, PhoneIoRequest, PhoneCaptureRequest, PhoneAgentInstallOptions,
  PhoneDeviceList, PhoneCaptureStream, PhoneScreenshot, PhoneAgentStatus, PhoneAgentInstallResult,
} from './types.ts'
export * from './types.ts'
export { FREE_SIGNING_PROFILE_REMINDER } from './mobilecli-phone-runtime.ts'
/** Validated deployment settings for the external mobilecli generation. */
export interface Config {
  /** Executable override; otherwise discover mobilecli through PATH and npm locations. */
  executablePath?: string
  /** Wait for environment-owned activation instead of starting at composition. */
  deferStart?: boolean
  /** Sole loopback listener port passed to mobilecli. */
  serverPort?: number
  /** Health probe and listing poll interval in milliseconds. */
  pollIntervalMs?: number
  /** Stable-child interval after baseline listing in milliseconds. */
  readyStabilityMs?: number
  /** Complete readiness budget in milliseconds. */
  readyTimeoutMs?: number
  /** Ordinary RPC and screenshot budget in milliseconds. */
  requestTimeoutMs?: number
  /** Android H264 syntax-recognition budget in milliseconds. */
  h264ProbeTimeoutMs?: number
  /** Pool disposal wait budget; expiry retains pending cleanup ownership. */
  cleanupTimeoutMs?: number
  /** Caller wait for foreign capture cleanup in milliseconds. */
  captureCleanupTimeoutMs?: number
  /** Virtual-device boot budget in milliseconds. */
  bootTimeoutMs?: number
  /** One-shot agent command budget in milliseconds. */
  agentTimeoutMs?: number
  /** Existing provisioning profile required for real-iOS agent installation. */
  provisioningProfilePath?: string
}

/** Runtime configuration schema applied by composition. */
export const Config: z<Config> = z.object({
  deferStart: z.boolean().default(false),
  serverPort: z.number().default(12_000),
  pollIntervalMs: z.number().default(5_000),
  readyStabilityMs: z.number().default(50),
  readyTimeoutMs: z.number().default(60_000),
  requestTimeoutMs: z.number().default(30_000),
  h264ProbeTimeoutMs: z.number().default(15_000),
  captureCleanupTimeoutMs: z.number().default(1_000),
  cleanupTimeoutMs: z.number().default(10_000),
  bootTimeoutMs: z.number().default(180_000),
  agentTimeoutMs: z.number().default(120_000),
})
export { PhoneDevicesError } from './errors.ts'
export { deviceId, phoneCaptureId } from './ids.ts'
export { verifyAnnexBH264KeyAccessUnit } from './h264.ts'
export type { H264KeyAccessUnitVerificationOptions } from './h264.ts'
export { jpegExifRotation, probeMjpegExifRotation, verifyMjpegJpegPicture } from './jpeg.ts'
export type { MjpegPictureVerificationOptions } from './jpeg.ts'
export { resolveMobilecliExecutable } from './resolve-binary.ts'
export type { ServerExit } from './server-process.ts'
declare module '@deepseek-ai/cordis' { interface Context { phoneDevices: PhoneDevices } }

/**
 * Stable fleet facade over one retained external pool occupancy. Subscribers survive
 * replacement; operations remain pinned to their entry generation. Disabled calls
 * reject PHONE_UNRESOLVED without acquiring or starting a child.
 */
export class PhoneDevices extends Service {
  static readonly Config = Config
  readonly [PHONE_RUNTIME_STATE_OWNER]: PhoneRuntimeStateOwner = Object.freeze({})
  private readonly pool: PhoneRuntimePool
  private occupancy: PhoneRuntimeHandle | undefined
  private admitted: MobilecliGeneration | undefined
  private readonly changes = new Set<(change: PhoneDeviceChange) => void>()
  private readonly readiness = new Set<(ready: boolean) => void>()
  private ready = false
  private closing = false
  private readonly lifetime = new AbortController()
  private tail: Promise<void> = Promise.resolve()
  private unresolved: PhoneDevicesError | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'phoneDevices')
    const resolved = resolveValidatedConfig(config)
    let executablePath: string | undefined
    try {
      if (resolved.deferStart) throw new Error('the phone runtime is waiting for its environment owner to select mobilecli')
      executablePath = resolveMobilecliExecutable({
        ...(resolved.executablePath === undefined ? {} : { executablePath: resolved.executablePath }),
        env: process.env,
      })
    } catch (error) {
      this.unresolved = new PhoneDevicesError('PHONE_UNRESOLVED', (error as Error).message, { cause: error })
    }
    this.pool = createPhoneRuntimePool(new MobilecliPhoneRuntime(resolved, ctx.logger, generation => this.admit(generation)), {
      cleanupTimeoutMs: resolved.cleanupTimeoutMs,
      ...(executablePath === undefined ? {} : { executablePath }),
    })
    ctx.effect(() => registerPhoneRuntimeStateReader(this[PHONE_RUNTIME_STATE_OWNER], () => this.admitted?.readListing()), 'phone runtime state reader')
    ctx.effect(() => () => {
      this.closing = true
      this.changes.clear()
      this.readiness.clear()
      this.admitted?.revoke(new PhoneDevicesError('PHONE_DISPOSED', 'the phone runtime service is disposed'))
      this.admitted = undefined
      this.ready = false
      this.lifetime.abort(new PhoneDevicesError('PHONE_DISPOSED', 'the phone runtime service is disposed'))
      return this.pool.dispose().then(() => {
        const state = this.pool.lifecycle()
        if (state.cleanupPending > 0 || state.cleanupFailures.length > 0) ctx.logger.warn(`phone-runtime: cleanup pending=${String(state.cleanupPending)} failures=${state.cleanupFailures.join('; ')}`)
      })
    }, 'phone runtime pooled teardown')
  }

  protected async [Service.init](): Promise<void> {
    if (this.unresolved === undefined) this.occupancy = await this.pool.acquireExternal(this.lifetime.signal)
  }

  private admit(generation: MobilecliGeneration): GenerationPublication {
    this.assertAccepting()
    this.admitted = generation
    return {
      validate: (change) => {
        if (this.closing || this.admitted !== generation) throw new PhoneDevicesError('PHONE_ABORTED', 'phone generation publication retired')
        phoneRuntimeStateValidator(this[PHONE_RUNTIME_STATE_OWNER])?.(change)
      },
      changed: (change) => { if (!this.closing && this.admitted === generation) this.notify(this.changes, change) },
      readiness: (ready) => { if (!this.closing && this.admitted === generation) this.publishReady(ready) },
    }
  }
  private notify<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of [...listeners]) {
      try { listener(value) } catch (error) { this.ctx.logger.warn('phone-runtime: observer failed'); this.ctx.logger.warn(error) }
    }
  }
  private publishReady(ready: boolean): void {
    if (this.ready === ready) return
    this.ready = ready
    this.notify(this.readiness, ready)
  }
  private revoke(): void {
    this.publishReady(false)
    this.admitted?.revoke()
    this.admitted = undefined
  }
  private assertAccepting(): void {
    if (this.closing) throw new PhoneDevicesError('PHONE_DISPOSED', 'the phone runtime service is disposed')
  }
  private current(): PhoneRuntimeHandle | MobilecliGeneration {
    this.assertAccepting()
    if (this.unresolved !== undefined) throw this.unresolved
    if (this.occupancy !== undefined) return this.occupancy
    // Every transition clears unresolved only after publishing an occupancy or admitted generation.
    return this.admitted as MobilecliGeneration
  }
  /**
   * Read current generation readiness.
   * @returns whether the admitted generation currently accepts operations.
   */
  isReady(): boolean { return !this.closing && this.ready }
  /**
   * Subscribe across replacements; subscriber exceptions are contained.
   * @param listener - Receives each committed listing delta synchronously.
   * @returns idempotent unsubscribe.
   */
  onChanged(listener: (change: PhoneDeviceChange) => void): () => void {
    this.changes.add(listener)
    return () => { this.changes.delete(listener) }
  }
  /**
   * Subscribe to admitted generation readiness transitions across replacements.
   * @param listener - Receives the committed readiness value.
   * @returns idempotent unsubscribe.
   */
  onReadinessChanged(listener: (ready: boolean) => void): () => void {
    this.readiness.add(listener)
    return () => { this.readiness.delete(listener) }
  }

  /**
   * Resolve the executable before retiring the old generation, then join cleanup
   * before startup. Cancellation never admits a replacement occupancy.
   * @param executablePath - Executable selected by the environment owner.
   * @param signal - Optional cancellation of queued replacement and startup.
   * @param environment - Non-sensitive SDK environment pinned to this generation.
   */
  async activateExecutable(
    executablePath: string,
    signal?: AbortSignal,
    environment: Readonly<Record<string, string>> = {},
  ): Promise<void> {
    this.assertAccepting()
    if (signal?.aborted === true) throw new PhoneDevicesError('PHONE_ABORTED', 'phone runtime activation was cancelled')
    const resolved = resolveMobilecliExecutable({ executablePath, env: process.env })
    const fused = signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal])
    const work = this.tail.then(async () => {
      this.assertAccepting()
      if (fused.aborted) throw new PhoneDevicesError('PHONE_ABORTED', 'phone runtime activation was cancelled')
      this.revoke()
      this.unresolved = new PhoneDevicesError('PHONE_UNRESOLVED', 'the phone runtime is not prepared')
      await this.pool.replaceExternal({ executablePath: resolved, environment, signal: fused })
      this.assertAccepting()
      if (activationAborted(fused) || this.admitted?.isReady() !== true) {
        const failure = new PhoneDevicesError('PHONE_ABORTED', 'phone runtime activation was cancelled')
        this.revoke()
        try {
          await this.pool.stopExternal()
        } catch (cleanup) {
          throw phoneFailureWithCleanup(failure, cleanup, 'phone runtime activation rollback cleanup failed')
        }
        throw failure
      }
      const previous = this.occupancy
      this.occupancy = await this.pool.acquireExternal(fused)
      this.unresolved = undefined
      await previous?.release()
    })
    this.tail = work.catch(() => {})
    await work
  }
  /** Retire and join the current generation; subsequent ordinary calls remain unresolved without restarting. */
  async deactivate(): Promise<void> {
    this.assertAccepting()
    const work = this.tail.then(async () => {
      this.assertAccepting()
      this.revoke()
      this.unresolved = new PhoneDevicesError('PHONE_UNRESOLVED', 'the phone runtime is not prepared')
      await this.pool.stopExternal()
    })
    this.tail = work.catch(() => {})
    await work
  }
  /**
   * Acquire a fresh grouped listing from the entry generation.
   * @param signal - Optional caller cancellation.
   * @returns the committed Android/iOS device listing.
   */
  async listDevices(signal?: AbortSignal): Promise<PhoneDeviceList> { return await this.current().listDevices(signal) }
  /**
   * Boot a listed virtual device and schedule a listing refresh.
   * @param id - Device identifier; physical devices are refused.
   * @param signal - Optional caller cancellation.
   */
  async boot(id: DeviceId, signal?: AbortSignal): Promise<void> { await this.current().boot(id, signal) }
  /**
   * Shut down a listed virtual device and schedule a listing refresh.
   * @param id - Device identifier; physical devices are refused.
   * @param signal - Optional caller cancellation.
   */
  async shutdown(id: DeviceId, signal?: AbortSignal): Promise<void> { await this.current().shutdown(id, signal) }
  /**
   * Execute semantic input after live incarnation and capture authorization.
   * @param request - Device identifier, action, and trusted coordinate source.
   * @param signal - Optional caller cancellation.
   */
  async io(request: PhoneIoRequest, signal?: AbortSignal): Promise<void> { await this.current().io(request, signal) }
  /**
   * Open generation-owned capture; retirement also cancels unread or locked bodies.
   * @param request - Device, format, optional capture identity, and cancellation.
   * @returns content type and caller-readable byte stream.
   */
  async startCapture(request: PhoneCaptureRequest): Promise<PhoneCaptureStream> { return await this.current().startCapture(request) }
  /**
   * Persist a PNG still only while its entry generation remains active.
   * @param id - Listed device identifier.
   * @param signal - Optional caller cancellation.
   * @returns media type and owner-only absolute PNG path.
   */
  async screenshot(id: DeviceId, signal?: AbortSignal): Promise<PhoneScreenshot> { return await this.current().screenshot(id, signal) }
  /**
   * Query device-agent installation using an owned command tree.
   * @param id - Listed device identifier.
   * @param signal - Optional caller cancellation.
   * @returns parsed agent installation status and provisioning guidance.
   */
  async agentStatus(id: DeviceId, signal?: AbortSignal): Promise<PhoneAgentStatus> { return await this.current().agentStatus(id, signal) }
  /**
   * Install or re-sign an agent without crossing generation replacement.
   * @param id - Listed device identifier.
   * @param options - Force reinstall and optional caller cancellation.
   * @returns installation status and whether a forced reinstall occurred.
   */
  async installAgent(id: DeviceId, options?: PhoneAgentInstallOptions): Promise<PhoneAgentInstallResult> {
    return await this.current().installAgent(id, options)
  }
}
export default PhoneDevices

function activationAborted(signal: AbortSignal): boolean {
  return signal.aborted
}
