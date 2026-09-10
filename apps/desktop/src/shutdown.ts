/** Desktop owner cleanup that observes every independently started disposal. */

/** Native quit policy remains with Electron; allow-quit never calls the exit adapter. */
export type DesktopShutdownMode = 'exit' | 'allow-quit'

/** Desktop-specific cleanup and terminal callbacks. */
export interface DesktopShutdownDependencies {
  /**
   * Close Host admission synchronously; do not await the shutdown policy that invokes this callback.
   * @returns Complete Host cleanup task; throws and rejections are reported after independent cleanup settles.
   */
  stopHost(): Promise<void>
  /**
   * Unsubscribe events and dispose other Desktop owners, observing every branch independently of Host cleanup.
   * @param mode - First-request policy; allow-quit leaves native quit timing to Electron.
   * @returns Completion after all owned cleanup settles; throws and rejections become cleanup failures.
   */
  cleanup(mode: DesktopShutdownMode): Promise<void>
  /**
   * Publish successful completion after Host and independent cleanup fulfill, before any explicit exit.
   * Throws and rejections are reported as shutdown failures. The callback is optional for existing consumers.
   * @returns Completion of success publication.
   */
  successReceipt?(): void | Promise<void>
  /**
   * Terminate only for explicit exit, after Host cleanup, independent cleanup, and success publication fulfill;
   * throws reject policy completion.
   * @param code - First-request exit code on cleanup success, or 1 on cleanup failure.
   */
  exit(code: number): void
  /**
   * Report aggregated cleanup failure after settlement; reporter exceptions are contained and cannot suppress exit.
   * @param error - Cleanup failure, not an exit-adapter exception.
   */
  reportError(error: unknown): void
}

/** First-request mode/code ownership and a reentry-safe Desktop shutdown promise. */
export class DesktopShutdown {
  private task: Promise<void> | undefined
  /** @param dependencies - Cleanup and terminal adapters satisfying DesktopShutdownDependencies obligations. */
  constructor(private readonly dependencies: DesktopShutdownDependencies) {}

  /**
   * Publish shutdown before closing Host admission or invoking cleanup callbacks.
   * @param code - Exit code on successful cleanup; cleanup failure uses 1.
   * @param mode - First request chooses explicit exit or native allow-quit.
   * @returns The same policy-completion promise, including after handled cleanup failure;
   * resolution is not a successful-cleanup or child-exit acknowledgment. Exit-adapter throws reject.
   */
  request(code: number, mode: DesktopShutdownMode): Promise<void> {
    if (this.task !== undefined) return this.task
    let resolve!: () => void
    let reject!: (error: unknown) => void
    this.task = new Promise<void>((yes, no) => { resolve = yes; reject = no })
    let host: Promise<void>
    try { host = this.dependencies.stopHost() } catch (error) { host = Promise.resolve().then(() => { throw error }) }
    const completion = settleDesktopCleanup([() => host, () => this.dependencies.cleanup(mode)])
      .then(() => this.dependencies.successReceipt?.())
    void completion.then(
      () => {
        if (mode === 'exit') this.dependencies.exit(code)
      },
      (error: unknown) => {
        try {
          this.dependencies.reportError(error)
        } catch {
          // Diagnostic sink failures cannot replace the cleanup outcome or suppress explicit exit.
        }
        if (mode === 'exit') this.dependencies.exit(1)
      },
    ).then(resolve, reject)
    return this.task
  }
}

/**
 * Attempt every cleanup callback, including after synchronous throws, and join all results.
 * @param actions - Independent cleanup operations, invoked in order in separate promise tasks.
 * @returns Completion or all failures after every cleanup has settled.
 */
export async function settleDesktopCleanup(actions: readonly (() => void | Promise<unknown>)[]): Promise<void> {
  const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)))
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : [])
  if (errors.length > 0) throw new AggregateError(errors, 'Desktop owner disposal failed')
}

/**
 * Close window presence before disposal, attempting disposal even when close fails.
 * @param presence - The captured Desktop presence owner.
 * @returns Completion after both operations, or their aggregate failure.
 */
export async function disposeDesktopPresence(presence: {
  closeWindow(): Promise<void>
  dispose(): Promise<void>
} | undefined): Promise<void> {
  if (presence === undefined) return
  const errors: unknown[] = []
  try { await presence.closeWindow() } catch (error) { errors.push(error) }
  try { await presence.dispose() } catch (error) { errors.push(error) }
  if (errors.length > 0) throw new AggregateError(errors, 'Desktop presence shutdown failed')
}

/**
 * Dispose Account and Personal Pairing owners concurrently and aggregate failures.
 * @param account - Account lifecycle owner.
 * @param pairing - Personal Pairing lifecycle owner.
 */
export async function disposeDesktopOwners(
  account: { dispose(): Promise<void> },
  pairing: { dispose(): Promise<void> },
): Promise<void> {
  await settleDesktopCleanup([() => account.dispose(), () => pairing.dispose()])
}
