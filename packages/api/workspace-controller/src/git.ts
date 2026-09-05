/**
 * No-shell Workspace Git command runner over the subprocess tree service.
 * @module @deepseek-ai/dsh-api-workspace-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import type { SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'

/** Maximum captured stdout or stderr for one Workspace Git command. */
export const WORKSPACE_GIT_OUTPUT_MAX_BYTES = 1024 * 1024
/** Terminate-escalation grace for one Workspace Git process tree. */
export const WORKSPACE_GIT_GRACE_MS = 1_000

const WORKSPACE_GIT_ENV_ALLOWLIST = new Set([
  'COMSPEC', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'PATHEXT', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE',
])

/**
 * Build the production Git runner over `ctx.subprocess`.
 * @param ctx - Host context that may carry the subprocess service.
 * @param cwd - spawn working directory; Git still receives `-C` for the Workspace path.
 * @returns a runner that accepts only the `git` executable.
 */
export function createWorkspaceGitCommand(ctx: Context, cwd: string): NativeCommandRunner {
  return async (command, args, signal) => {
    if (command !== 'git') throw new TypeError(`workspace Git runner rejects executable ${JSON.stringify(command)}`)
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) throw new Error('workspace Git operations require the subprocess service')
    const env: NodeJS.ProcessEnv = {}
    for (const key of Object.keys(process.env)) {
      if (!WORKSPACE_GIT_ENV_ALLOWLIST.has(key.toUpperCase())) env[key] = undefined
    }
    env.GCM_INTERACTIVE = 'Never'
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'credential.interactive'
    env.GIT_CONFIG_VALUE_0 = 'never'
    env.GIT_TERMINAL_PROMPT = '0'
    const handle = subprocess.spawn({
      argv: [command, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: WORKSPACE_GIT_OUTPUT_MAX_BYTES },
        stderr: { maxBytes: WORKSPACE_GIT_OUTPUT_MAX_BYTES },
      },
      graceMs: WORKSPACE_GIT_GRACE_MS,
      signal,
      env,
    })
    let outcome: SubprocessOutcome
    try {
      outcome = await handle.done
    } finally {
      if (signal.aborted) handle.terminate()
      await handle.waitForExit()
    }
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    if (stdout === undefined || stderr === undefined || stdout.lossy || stderr.lossy) {
      throw new Error('workspace Git output exceeded the bounded capture')
    }
    if (outcome.exitCode !== 0) {
      throw new Error(`workspace Git exited with ${outcome.exitCode === null ? outcome.signal ?? 'unknown signal' : `code ${String(outcome.exitCode)}`}`)
    }
    return { stdout: stdout.text, stderr: stderr.text }
  }
}
