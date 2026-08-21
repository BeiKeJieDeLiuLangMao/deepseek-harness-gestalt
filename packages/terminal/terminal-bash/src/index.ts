/**
 * Persistent shell PTY backend over the subprocess terminal primitive, shared
 * sandbox policy, bounded output, and provider-owned session cleanup.
 * @module @deepseek-ai/dsh-terminal-bash
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { TerminalBackendCleanupError } from '@deepseek-ai/dsh-terminal'
import type { TerminalBackend, TerminalBackendSpawnSpec } from '@deepseek-ai/dsh-terminal'
import type { SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { effectiveSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { ENCODING_PREAMBLE } from '@deepseek-ai/dsh-pwsh-local'
import { type Config, type ResolvedConfig, resolveConfig, type ShellDialect, validateConfig } from './config.ts'
import { LocalPtySession } from './session.ts'
import { CONTROLLED_PROMPT, hasDefaultPwshPrompt } from './sanitize.ts'

export { Config } from './config.ts'
export type { Config as TerminalLocalConfig } from './config.ts'

/** Cordis plugin name. */
export const name = 'terminal-bash'
/** Required services: PTY registry, shared confinement policy, and process substrate. */
export const inject = ['terminals', 'sandboxPolicy', 'subprocess']

interface SandboxModeFenceState {
  pty: Context['terminals']
  sandboxPolicy: Context['sandboxPolicy']
}

const sandboxModeFences = new WeakMap<Agent, SandboxModeFenceState>()

function ensureSandboxModeFence(ctx: Context, owner: Agent): void {
  const existing = sandboxModeFences.get(owner)
  if (existing !== undefined) {
    existing.pty = ctx.terminals
    existing.sandboxPolicy = ctx.sandboxPolicy
    return
  }
  const state: SandboxModeFenceState = { pty: ctx.terminals, sandboxPolicy: ctx.sandboxPolicy }
  sandboxModeFences.set(owner, state)
  owner.ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (session !== owner.session || event.type !== 'sandbox/mode') return
    const currentMode = effectiveSandboxMode(session.events) ?? state.sandboxPolicy.defaultMode
    if (event.data.mode === currentMode || !state.pty.hasOwnerActivity(owner)) return
    throw new Error(
      `cannot change sandbox mode from "${currentMode}" to "${event.data.mode}" while persistent terminal sessions are open or being created; wait for creation to settle and close them first`,
    )
  }, { global: true })
}

function childEnvironment(spec: TerminalBackendSpawnSpec, dialect: ShellDialect): Record<string, string> {
  // The subprocess provider supplies its own scrubbed ambient base; these are
  // deliberate terminal-specific overrides layered after it.
  const common = {
    TERM: 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    DSH_SHELL: '1',
    DSH_SESSION_ID: spec.owner.id,
    DSH_PTY_SESSION_ID: spec.sessionId,
  }
  if (dialect === 'pwsh') {
    // pwsh ignores PS1/PROMPT_COMMAND; its prompt is installed by the startup
    // bootstrap instead, and NO_COLOR keeps the renderer quiet.
    return { ...common, NO_COLOR: '1' }
  }
  return {
    ...common,
    PS1: CONTROLLED_PROMPT,
    // Re-asserting PS1 after the marker keeps prompt readiness working when a
    // command overwrote the shell variable: bash runs PROMPT_COMMAND before
    // rendering each prompt, so an override never survives to the next prompt.
    PROMPT_COMMAND: `printf "\\033]133;D;%s\\007" "$?"; PS1='${CONTROLLED_PROMPT}'`,
    BASH_SILENCE_DEPRECATION_WARNING: '1',
  }
}

const PWSH_PROMPT_HEAD = CONTROLLED_PROMPT.slice(0, Math.ceil(CONTROLLED_PROMPT.length / 2))
const PWSH_PROMPT_TAIL = CONTROLLED_PROMPT.slice(PWSH_PROMPT_HEAD.length)
/** Text `Write-Output` prints after the spawn `prompt` function is defined. */
export const PWSH_SETUP_DONE = '__DSH_PWSH_SETUP_DONE__'
const PWSH_SETUP_DONE_HEAD = PWSH_SETUP_DONE.slice(0, Math.ceil(PWSH_SETUP_DONE.length / 2))
const PWSH_SETUP_DONE_TAIL = PWSH_SETUP_DONE.slice(PWSH_SETUP_DONE_HEAD.length)
/**
 * pwsh `prompt` function written at spawn, then a `Write-Output` of
 * {@link PWSH_SETUP_DONE}. OSC `133;D;` + BEL is built with `[char]27` /
 * `[char]7` because raw ESC in submitted input is unreliable under
 * PSReadLine. The printable prompt and the done token are each two
 * concatenated literals so a PTY echo of this source cannot match either.
 */
export const PWSH_PROMPT_SETUP =
  `function prompt { [Console]::Write([char]27 + ']133;D;' + [int]$LASTEXITCODE + [char]7); ('${PWSH_PROMPT_HEAD}' + '${PWSH_PROMPT_TAIL}') }; Write-Output ('${PWSH_SETUP_DONE_HEAD}' + '${PWSH_SETUP_DONE_TAIL}')`
function spawnArgv(ctx: Context, config: ResolvedConfig, policy: SandboxExecutionPolicy): string[] {
  const argv = [config.shellPath, ...config.shellArgs]
  if (policy.mode === 'danger-full-access') return argv
  const sandbox = ctx.get('sandbox')
  if (sandbox === undefined) {
    throw new Error(`terminal-bash: sandbox mode "${policy.mode}" requires a ctx.sandbox provider in the execution world`)
  }
  // Re-state the discriminant because object spread does not preserve its narrowed type.
  return sandbox.confine(argv, { ...policy, mode: policy.mode }).argv
}

// TODO(pty-initialize-race-home): Fold this outer abort race into
// LocalPtySession.initialize when the send-state consolidation lands; the
// session already owns the send lifecycle the race protects.
async function startupSession(
  session: LocalPtySession,
  dialect: ShellDialect,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const start = async (): Promise<void> => {
    if (dialect === 'bash') {
      await session.initialize(signal)
      return
    }
    // pwsh cannot install its prompt from the environment: wait until the
    // last line is the default `PS …>` prompt, then write the prompt
    // function. `initialize` can settle on stdin_wait at 150 ms and write
    // too early (Linux CI 32463876213: setup send got session_exit). A
    // write during banner lands on the PTY as echo and never executes
    // (Linux CI 32462089006: scrollback is the setup source plus
    // `PS /tmp/…>`). The first submitted send also pins UTF-8 output (the
    // shared pwsh-local preamble) before anything runs. A Linux PTY often
    // never reprints CONTROLLED_PROMPT after that function runs, so spawn
    // waits for PWSH_SETUP_DONE from the trailing Write-Output instead.
    // Follow-ups continue until that token is visible. session_exit,
    // per-send timeout, and the spawn-wall timeoutMs reject.
    const startedAt = Date.now()
    let readyToSetup = false
    let written = false
    let viewport = ''
    for (;;) {
      const operation = session.startSend({
        text: written || !readyToSetup ? '' : ENCODING_PREAMBLE + PWSH_PROMPT_SETUP,
        submit: readyToSetup && !written,
        ...signal !== undefined ? { signal } : {},
      })
      if (readyToSetup) written = true
      const result = await operation.done
      if (result.waitReason === 'session_exit') throw new Error('PTY shell exited during startup')
      if (result.waitReason === 'timeout') {
        throw new Error(
          `PTY shell did not reach readiness before startup timeout; viewport=${JSON.stringify(result.viewport.slice(-400))}`,
        )
      }
      viewport = result.viewport
      const scrollback = session.read({ offset: 0, count: 20 }).text
      if (!readyToSetup) {
        if (hasDefaultPwshPrompt(viewport) || hasDefaultPwshPrompt(scrollback)) readyToSetup = true
      } else if (viewport.includes(PWSH_SETUP_DONE) || scrollback.includes(PWSH_SETUP_DONE)) {
        session.motd = viewport.includes(PWSH_SETUP_DONE) ? viewport : scrollback
        break
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `PTY shell did not reach readiness before startup timeout; viewport=${JSON.stringify(viewport.slice(-400))}; scrollback=${JSON.stringify(scrollback.slice(-400))}`,
        )
      }
    }
  }
  if (signal === undefined) {
    await start()
    return
  }
  const aborted = Promise.withResolvers<never>()
  const onAbort = (): void => { aborted.reject(signal.reason) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    signal.throwIfAborted()
    await Promise.race([start(), aborted.promise])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/** Local shell backend registered under the configured type. */
export class BashTerminalBackend implements TerminalBackend {
  readonly type: string

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
    private readonly spawnTerminal: (
      spec: SubprocessTerminalSpawnSpec,
    ) => Promise<SubprocessTerminalHandle> = spec => ctx.subprocess.spawnTerminal(spec),
    private readonly createSession: (
      terminal: SubprocessTerminalHandle,
      config: ResolvedConfig,
    ) => LocalPtySession = (terminal, config) => new LocalPtySession(terminal, config),
  ) {
    this.type = config.backendType
  }

  async spawn(spec: TerminalBackendSpawnSpec): Promise<LocalPtySession> {
    spec.signal?.throwIfAborted()
    ensureSandboxModeFence(this.ctx, spec.owner)
    const policy = this.ctx.sandboxPolicy.resolve({ session: spec.owner.session })
    const argv = spawnArgv(this.ctx, this.config, policy)
    if (argv[0] === undefined) throw new Error('terminal-bash: sandbox returned empty argv')
    const terminal = await this.spawnTerminal({
      argv,
      cwd: spec.cwd ?? policy.workspaceRoot,
      env: childEnvironment(spec, this.config.shellDialect),
      rows: this.config.rows,
      cols: this.config.cols,
      graceMs: this.config.disposeGraceMs,
      signal: spec.signal,
    })
    const session = this.createSession(terminal, this.config)
    try {
      await startupSession(session, this.config.shellDialect, this.config.timeoutMs, spec.signal)
      return session
    } catch (error) {
      try {
        await session.close('PTY startup failed')
      } catch (closeError: unknown) {
        throw new TerminalBackendCleanupError(error, closeError)
      }
      throw error
    }
  }
}

/** Register the local PTY backend. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  validateConfig(resolved)
  ctx.terminals.registerBackend(new BashTerminalBackend(ctx, resolved))
}
