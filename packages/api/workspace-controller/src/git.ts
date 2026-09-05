/**
 * No-shell Workspace Git command runner over the subprocess tree service.
 * @module @deepseek-ai/dsh-api-workspace-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import { deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'

/** Maximum captured stdout or stderr for one Workspace Git command. */
export const WORKSPACE_GIT_OUTPUT_MAX_BYTES = 1024 * 1024
/** Terminate-escalation grace for one Workspace Git process tree. */
export const WORKSPACE_GIT_GRACE_MS = 1_000
/** Default Host deadline for one Workspace Git command. */
export const DEFAULT_WORKSPACE_GIT_TIMEOUT_MS = 30_000
/** Capability-owned timeout code fused into the production Git abort signal. */
export const WORKSPACE_GIT_TIMEOUT_CODE = 'WORKSPACE_GIT_TIMEOUT'

const WORKSPACE_GIT_ENV_ALLOWLIST = new Set([
  'COMSPEC', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'PATHEXT', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE',
])

/**
 * Build the production Git runner over `ctx.subprocess`.
 * @param ctx - Host context that may carry the subprocess service.
 * @param cwd - spawn working directory; Git still receives `-C` for the Workspace path.
 * @param timeoutMs - Host-owned deadline fused with the caller abort signal.
 * @returns a runner that accepts only the `git` executable and forces `LANG`/`LC_ALL=C`.
 */
export function createWorkspaceGitCommand(
  ctx: Context,
  cwd: string,
  timeoutMs: number = DEFAULT_WORKSPACE_GIT_TIMEOUT_MS,
): NativeCommandRunner {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `workspace Git timeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return async (command, args, signal) => {
    if (command !== 'git') throw new TypeError(`workspace Git runner rejects executable ${JSON.stringify(command)}`)
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) throw new Error('workspace Git operations require the subprocess service')
    const env: NodeJS.ProcessEnv = {}
    for (const key of Object.keys(process.env)) {
      env[key] = WORKSPACE_GIT_ENV_ALLOWLIST.has(key.toUpperCase()) ? process.env[key] : undefined
    }
    env.GCM_INTERACTIVE = 'Never'
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'credential.interactive'
    env.GIT_CONFIG_VALUE_0 = 'never'
    env.GIT_TERMINAL_PROMPT = '0'
    env.LANG = 'C'
    env.LC_ALL = 'C'
    using hostDeadline = deadline(signal, timeoutMs, WORKSPACE_GIT_TIMEOUT_CODE)
    let handle: SubprocessHandle | undefined
    let outcome: SubprocessOutcome | undefined
    let spawnError: unknown
    try {
      handle = subprocess.spawn({
        argv: [command, ...args],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: WORKSPACE_GIT_OUTPUT_MAX_BYTES },
          stderr: { maxBytes: WORKSPACE_GIT_OUTPUT_MAX_BYTES },
        },
        graceMs: WORKSPACE_GIT_GRACE_MS,
        signal: hostDeadline.signal,
        env,
      })
      outcome = await handle.done
    } catch (error) {
      spawnError = error
    } finally {
      if (handle !== undefined) {
        if (hostDeadline.signal.aborted) handle.terminate()
        await handle.waitForExit()
      }
    }
    if (timeoutOf(hostDeadline.signal, WORKSPACE_GIT_TIMEOUT_CODE) !== undefined) {
      throw new Error(`workspace Git timed out after ${timeoutMs}ms`)
    }
    if (spawnError !== undefined) throw spawnError
    if (handle === undefined || outcome === undefined) throw new Error('workspace Git process did not start')
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    if (stdout === undefined || stderr === undefined || stdout.lossy || stderr.lossy) {
      throw new Error('workspace Git output exceeded the bounded capture')
    }
    if (outcome.exitCode !== 0) {
      const terminatingSignal = outcome.signal
      const code = outcome.exitCode === null ? terminatingSignal ?? 'unknown signal' : outcome.exitCode
      throw Object.assign(
        new Error(`workspace Git exited with ${typeof code === 'number' ? `code ${String(code)}` : code}`),
        { code, signal: terminatingSignal, stdout: stdout.text, stderr: stderr.text },
      )
    }
    return { stdout: stdout.text, stderr: stderr.text }
  }
}

/**
 * Numeric Git exit, spawn code, or terminating signal from a Workspace Git runner failure.
 * @param error - thrown runner result, including `runNativeCommand` and production subprocess failures.
 * @returns the attached `code`, or a parsed production-runner exit/signal from the error message.
 */
export function workspaceGitFailureCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = 'code' in error ? error.code : undefined
  if (typeof code === 'number' || typeof code === 'string') return code
  const message = error instanceof Error ? error.message : undefined
  if (message === undefined) return undefined
  const numeric = /workspace Git exited with code (\d+)$/.exec(message)
  return numeric?.[1] === undefined ? undefined : Number(numeric[1])
}
