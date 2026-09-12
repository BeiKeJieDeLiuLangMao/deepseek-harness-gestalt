/**
 * Start the bundled Web Host as a child Node process and wait for its URL.
 * @module @deepseek-ai/dsh-desktop/spawn-web-host
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { webHostAnnouncementFromOutput } from './web-url.ts'

/** How we invoke `dsh web`. */
export interface WebHostCommand {
  /** Node executable (never Electron's execPath). */
  readonly node: string
  /** argv after the node executable, including the dsh bin. */
  readonly args: readonly string[]
  /** Process cwd: the Launch Directory. */
  readonly cwd: string
  /** Extra environment. */
  readonly env?: NodeJS.ProcessEnv
  /** Abort startup and terminate the child before rejecting. */
  readonly signal?: AbortSignal
}

/**
 * Who asked the Web Host child to stop, if anyone.
 * `none` is an unsolicited exit. `stop` is `RunningWebHost.stop`.
 * `abort` is the command AbortSignal after the URL was announced.
 */
type WebHostRequestedStop =
  | { readonly kind: 'none' }
  | { readonly kind: 'stop' }
  | { readonly kind: 'abort' }

/**
 * Immutable wait(2) facts for one Web Host child generation. Not process-tree proof.
 * Child stdout/stderr is omitted from this record. Pre-ready reject messages redact
 * one complete in-memory startup buffer, then truncate. That buffer is unbounded
 * until the URL is announced, then discarded. There is no post-ready raw retention.
 */
export interface WebHostExit {
  readonly pid: number | undefined
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly requestedStop: WebHostRequestedStop
}

/** Startup rejected because stopping an unreturned child failed; child exit is unproven. */
export class WebHostStartupCleanupError extends AggregateError {
  /** Distinguishes unproven child cleanup from ordinary startup rejection. */
  readonly kind = 'startup-cleanup-failed'

  /**
   * Preserve both startup failure and raw stop failure; neither establishes child exit.
   * @param startupError - Original abort or readiness-timeout failure.
   * @param cleanupError - Unmodified failure from the exact child's stop operation.
   */
  constructor(readonly startupError: Error, readonly cleanupError: unknown) {
    super([startupError, cleanupError], 'dsh web startup cleanup failed', { cause: startupError })
    this.name = 'WebHostStartupCleanupError'
  }
}

/** A running Web Host plus the loopback URL it printed. */
export interface RunningWebHost {
  /** Child process. */
  readonly child: ChildProcess
  /** Resolves with wait facts whenever the child exits, including before a consumer attaches. */
  readonly exited: Promise<WebHostExit>
  /**
   * Request termination, then resolve with the same record as {@link RunningWebHost.exited}.
   * The stop reason is recorded before `kill`.
   */
  readonly stop: () => Promise<WebHostExit>
  /** Public loopback origin including the assigned port. */
  readonly url: string
  /** Authenticated startup URL; exchanged once in memory and never logged. */
  readonly launchUrl: string
}

const SENSITIVE_ENVIRONMENT_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/iu
const DIAGNOSTIC_MAX = 800
const URL_SCAN_MAX = 512
const ABORT_STOP_WARNING_MAX = 200

function knownSecrets(environment: NodeJS.ProcessEnv): readonly string[] {
  return [...new Set(Object.entries(environment).flatMap(([name, value]) => (
    SENSITIVE_ENVIRONMENT_NAME.test(name) && value !== undefined && value.length > 0 ? [value] : []
  )))].toSorted((left, right) => right.length - left.length)
}

function incompleteSecretPrefixLength(text: string, secrets: readonly string[]): number {
  let keep = 0
  for (const secret of secrets) {
    const limit = Math.min(secret.length - 1, text.length)
    for (let prefix = limit; prefix >= 2; prefix -= 1) {
      if (text.endsWith(secret.slice(0, prefix)) && prefix > keep) keep = prefix
    }
  }
  return keep
}

function maskIncompleteSecretSuffix(text: string, secrets: readonly string[]): string {
  const keep = incompleteSecretPrefixLength(text, secrets)
  if (keep === 0) return text
  return `${text.slice(0, text.length - keep)}[REDACTED]`
}

function abortStopWarning(error: unknown, environment: NodeJS.ProcessEnv): string {
  const name = error instanceof Error ? error.name : 'Error'
  const message = error instanceof Error ? error.message : String(error)
  const text = redactWebHostDiagnostic(`${name}: ${message}`, environment)
  return text.length <= ABORT_STOP_WARNING_MAX ? text : `${text.slice(0, ABORT_STOP_WARNING_MAX)}…`
}

/**
 * Remove inherited or supplied credential values from child diagnostics.
 * @param output - Child diagnostic text.
 * @param environment - Environment containing credential values to mask.
 * @returns Redacted diagnostic text.
 */
export function redactWebHostDiagnostic(output: string, environment: NodeJS.ProcessEnv): string {
  let redacted = output
  const secrets = knownSecrets(environment)
  for (const secret of secrets) redacted = redacted.replaceAll(secret, '[REDACTED]')
  return redacted
    .replaceAll(/([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*)[^\s,;]+/giu, '$1[REDACTED]')
    .replaceAll(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, '$1[REDACTED]@')
    .replaceAll(/([?&]token=)[^&\s]+/giu, '$1[REDACTED]')
}

/**
 * Return a bounded diagnostic. Redacts complete known secrets on one buffer,
 * then masks a trailing suffix that is an incomplete known-secret prefix, then truncates.
 * @param output - Complete startup diagnostic buffer.
 * @param environment - Environment containing credential values to mask.
 * @returns Redacted startup summary bounded to 800 characters.
 */
export function webHostDiagnosticSummary(output: string, environment: NodeJS.ProcessEnv): string {
  const secrets = knownSecrets(environment)
  const redacted = maskIncompleteSecretSuffix(redactWebHostDiagnostic(output.trim(), environment), secrets)
  if (redacted.length <= DIAGNOSTIC_MAX) return redacted
  return `${redacted.slice(0, 398)}\n…\n${redacted.slice(-398)}`
}

/**
 * Format one Web Host exit for Desktop smoke logs.
 * @param record Frozen wait facts from {@link RunningWebHost.exited}.
 * @returns One line naming pid, code, signal, and requested-stop kind.
 */
export function formatWebHostExit(record: WebHostExit): string {
  return `web host exit pid=${String(record.pid)} code=${String(record.code)} signal=${String(record.signal)} requestedStop=${record.requestedStop.kind}`
}

function freezeWebHostExit(record: WebHostExit): WebHostExit {
  return Object.freeze({
    pid: record.pid,
    code: record.code,
    signal: record.signal,
    requestedStop: Object.freeze(record.requestedStop),
  })
}

/**
 * Spawn `dsh web` and resolve when it prints the loopback URL.
 * @param command - node, args, cwd.
 * @param timeoutMs - fail if the URL line does not appear.
 * @returns the child and URL. Pre-ready stop failure rejects with WebHostStartupCleanupError;
 * ordinary cancellation rejects only after the exact child's exit has been observed.
 */
export function spawnWebHost(
  command: WebHostCommand,
  timeoutMs = 30_000,
): Promise<RunningWebHost> {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, ...command.env }
    const child = spawn(command.node, [...command.args], {
      cwd: command.cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let requestedStop: WebHostRequestedStop = { kind: 'none' }
    let startupBuffer = ''
    let urlScan = ''
    let settled = false
    let record: WebHostExit | undefined
    let resolveExit!: (value: WebHostExit) => void
    const exited = new Promise<WebHostExit>((onResolve) => { resolveExit = onResolve })
    const publishExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      command.signal?.removeEventListener('abort', onAbort)
      record = freezeWebHostExit({
        pid: child.pid,
        code,
        signal,
        requestedStop,
      })
      resolveExit(record)
    }
    let stopPromise: Promise<WebHostExit> | undefined
    const requestStop = (cause: 'stop' | 'abort'): Promise<WebHostExit> => {
      if (requestedStop.kind === 'none') requestedStop = { kind: cause }
      if (stopPromise !== undefined) return stopPromise
      let resolveStop!: (value: WebHostExit) => void
      let rejectStop!: (error: unknown) => void
      stopPromise = new Promise((onResolve, onReject) => {
        resolveStop = onResolve
        rejectStop = onReject
      })
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill()
        void exited.then(resolveStop, rejectStop)
      } catch (error) {
        rejectStop(error)
      }
      return stopPromise
    }
    const stop = (): Promise<WebHostExit> => requestStop('stop')
    const terminateBeforeReady = (error: Error, cause: 'stop' | 'abort'): void => {
      settled = true
      clearTimeout(timer)
      void requestStop(cause).then(
        () => { reject(error) },
        (stopError: unknown) => {
          reject(new WebHostStartupCleanupError(error, stopError))
        },
      )
    }
    const onAbort = (): void => {
      if (settled) {
        void requestStop('abort').then(
          () => undefined,
          (error: unknown) => {
            process.emitWarning(abortStopWarning(error, environment), {
              type: 'WebHostAbortStopFailed',
              code: 'DSH_WEB_HOST_ABORT_STOP_FAILED',
            })
          },
        )
        return
      }
      terminateBeforeReady(new Error('dsh web startup aborted'), 'abort')
    }
    command.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      const tail = webHostDiagnosticSummary(startupBuffer, environment)
      terminateBeforeReady(new Error(
        `dsh web did not print a loopback URL within ${String(timeoutMs)}ms`
        + (tail.length === 0 ? '' : `\n${tail}`),
      ), 'stop')
    }, timeoutMs)
    if (command.signal?.aborted === true) onAbort()
    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString()
      if (!settled) {
        startupBuffer += text
        urlScan = `${urlScan}${text}`.slice(-URL_SCAN_MAX)
        const announcement = webHostAnnouncementFromOutput(urlScan)
        if (announcement === undefined) return
        settled = true
        startupBuffer = ''
        urlScan = ''
        clearTimeout(timer)
        resolve({
          child,
          exited,
          stop,
          url: announcement.origin,
          launchUrl: announcement.launchUrl,
        })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      command.signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      publishExit(code, signal)
      if (settled) return
      settled = true
      clearTimeout(timer)
      const tail = webHostDiagnosticSummary(startupBuffer, environment)
      reject(new Error(
        'dsh web exited before announcing a URL (code ' + String(code) + ', signal ' + String(signal) + ')'
        + (tail.length === 0 ? '' : '\n' + tail),
      ))
    })
  })
}
