/** Desktop-owned Web Host startup, runtime reuse, replacement, and shutdown. */
import type { DesktopBrowserRuntime } from './browser-runtime.ts'
import type { DesktopProjectMembershipAgentRuntime } from './project-membership-agent-runtime.ts'
import { WebHostStartupCleanupError, type RunningWebHost, type WebHostExit } from './spawn-web-host.ts'

/** Existing Desktop creators; a rejected creator cleans resources it has not returned. */
export interface DesktopHostDependencies {
  /**
   * Create a Browser runtime; clean unreturned resources before rejecting.
   * @returns Runtime ownership transferred to the lifecycle, even if shutdown began during creation.
   */
  createBrowser(): Promise<DesktopBrowserRuntime>
  /**
   * Create a Membership runtime; clean unreturned resources before rejecting.
   * @returns Runtime ownership transferred to the lifecycle, even if shutdown began during creation.
   */
  createMembership(): Promise<DesktopProjectMembershipAgentRuntime>
  /**
   * Start a Host without disposing the borrowed runtimes. On startup failure, cancellation, or timeout,
   * stop and join any unreturned child before rejecting; use WebHostStartupCleanupError if that cleanup fails.
   * Ordinary startup rejection must not represent an unreturned-child cleanup failure.
   * @param browser - Lifecycle-owned Browser runtime, retained across Host replacements.
   * @param membership - Lifecycle-owned Membership runtime, retained across Host replacements.
   * @param signal - Startup cancellation; an already aborted signal must prevent child creation.
   * @param timeoutMs - Host readiness deadline in milliseconds; omission selects the spawn adapter default.
   * @returns Ready Host ownership transferred to the lifecycle, including a result racing shutdown;
   * rejects with the startup error after successful cleanup, or WebHostStartupCleanupError otherwise.
   */
  spawn(browser: DesktopBrowserRuntime, membership: DesktopProjectMembershipAgentRuntime,
    signal: AbortSignal, timeoutMs?: number): Promise<RunningWebHost>
}

type Runtime = DesktopBrowserRuntime | DesktopProjectMembershipAgentRuntime

/** Owns exact runtime and child handles; retry and presentation policy belong to callers. */
export class DesktopHostLifecycle {
  private readonly controller = new AbortController()
  private browserRuntime: DesktopBrowserRuntime | undefined
  private membershipRuntime: DesktopProjectMembershipAgentRuntime | undefined
  private pending: Promise<RunningWebHost> | undefined
  private running: RunningWebHost | undefined
  private readonly hosts = new Set<RunningWebHost>()
  private readonly startupCleanupFailures: WebHostStartupCleanupError[] = []
  private readonly stops = new Map<RunningWebHost, Promise<WebHostExit>>()
  private readonly disposals = new Set<Promise<void>>()
  private shutdownTask: Promise<void> | undefined

  /** @param dependencies - Creator and spawn adapters satisfying DesktopHostDependencies ownership obligations. */
  constructor(private readonly dependencies: DesktopHostDependencies) {}

  /** Browser remains available across ordinary Host replacements. */
  get browser(): DesktopBrowserRuntime | undefined { return this.browserRuntime }
  /** Exact ready Host; callers must recheck closed/current after awaiting an operation. */
  get current(): RunningWebHost | undefined { return this.running }
  /** Admission closes synchronously when shutdown is requested. */
  get closed(): boolean { return this.shutdownTask !== undefined }

  /**
   * Admit startup, joining an already admitted start or replacement.
   * @param timeoutMs - Existing Host readiness timeout.
   * @returns The owned Host, or rejection after cancellation/initializer failure.
   */
  start(timeoutMs?: number): Promise<RunningWebHost> {
    return this.admit(false, timeoutMs)
  }

  /**
   * Retire the current Host before starting its replacement; preserve shared runtimes.
   * @param timeoutMs - Existing Host readiness timeout.
   * @returns The owned replacement, joining any operation already admitted.
   */
  replace(timeoutMs?: number): Promise<RunningWebHost> {
    return this.admit(true, timeoutMs)
  }

  private admit(replace: boolean, timeoutMs?: number): Promise<RunningWebHost> {
    if (this.closed) return Promise.reject(new Error('dsh web startup aborted'))
    if (this.pending !== undefined) return this.pending
    // Publication precedes creators, stop callbacks, and their synchronous reentry.
    const task = Promise.resolve().then(async () => {
      this.assertOpen()
      if (replace) {
        const previous = this.running
        this.running = undefined
        if (previous !== undefined) await this.stop(previous)
        this.assertOpen()
      }
      return await this.initialize(timeoutMs)
    })
    this.pending = task
    const clear = (): void => { this.pending = undefined }
    void task.then(clear, clear)
    return task
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('dsh web startup aborted')
  }

  private async initialize(timeoutMs?: number): Promise<RunningWebHost> {
    const acquired: Runtime[] = []
    try {
      this.assertOpen()
      if (this.browserRuntime === undefined) {
        const browser = await this.dependencies.createBrowser()
        this.browserRuntime = browser
        acquired.push(browser)
      }
      this.assertOpen()
      if (this.membershipRuntime === undefined) {
        const membership = await this.dependencies.createMembership()
        this.membershipRuntime = membership
        acquired.push(membership)
      }
      this.assertOpen()
    } catch (error) {
      // Shutdown owns late results and joins this operation; startup never joins shutdown.
      if (!this.closed) {
        if (acquired.length > 0) this.browserRuntime = undefined
        const results = await Promise.allSettled(acquired.map(runtime => this.disposeTracked(runtime)))
        const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : [])
        if (failures.length > 0) throw new AggregateError([error, ...failures], 'Desktop Host initialization cleanup failed')
      }
      throw error
    }
    const browser = this.browserRuntime
    const membership = this.membershipRuntime
    this.assertOpen()
    let running: RunningWebHost
    try {
      running = await this.dependencies.spawn(browser, membership, this.controller.signal, timeoutMs)
    } catch (error) {
      if (error instanceof WebHostStartupCleanupError) this.startupCleanupFailures.push(error)
      throw error
    }
    this.hosts.add(running)
    this.assertOpen()
    this.running = running
    return running
  }

  private stop(host: RunningWebHost): Promise<WebHostExit> {
    const existing = this.stops.get(host)
    if (existing !== undefined) return existing
    const task = Promise.resolve().then(() => host.stop())
    this.stops.set(host, task)
    return task
  }

  /** Rollback and shutdown transfer each owned runtime once; settled tasks remain joinable. */
  private disposeTracked(runtime: Runtime): Promise<void> {
    const task = Promise.resolve().then(() => runtime.dispose())
    this.disposals.add(task)
    return task
  }

  /**
   * Close admission, abort startup, join admitted work and all exact handles, then dispose runtimes.
   * @returns The same promise on every call; rejects only after all cleanup attempts settle.
   */
  shutdown(): Promise<void> {
    if (this.shutdownTask !== undefined) return this.shutdownTask
    const admitted = this.pending
    this.shutdownTask = Promise.resolve().then(async () => {
      // Typed unreturned-child cleanup failures are retained independently of startup settlement.
      await admitted?.catch(() => undefined)
      this.running = undefined
      const hostResults = await Promise.allSettled([...this.hosts].map(host => this.stop(host)))
      const browser = this.browserRuntime
      const membership = this.membershipRuntime
      this.browserRuntime = undefined
      this.membershipRuntime = undefined
      if (browser !== undefined) void this.disposeTracked(browser)
      if (membership !== undefined) void this.disposeTracked(membership)
      const runtimeResults = await Promise.allSettled([...this.disposals])
      const failures = [...hostResults, ...runtimeResults].flatMap(result => (
        result.status === 'rejected' ? [result.reason as unknown] : []
      ))
      failures.push(...this.startupCleanupFailures)
      if (failures.length > 0) throw new AggregateError(failures, 'Desktop Host shutdown failed')
    })
    this.controller.abort()
    return this.shutdownTask
  }
}
