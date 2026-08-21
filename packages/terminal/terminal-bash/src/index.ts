/**
 * Persistent shell PTY backend over the subprocess terminal primitive, shared
 * sandbox policy, bounded output, and provider-owned session cleanup.
 * @module @deepseek-ai/dsh-terminal-bash
 */

import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
import { CONTROLLED_PROMPT } from './sanitize.ts'

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

function childEnvironment(
  spec: TerminalBackendSpawnSpec,
  dialect: ShellDialect,
  pwshHome: string | undefined,
): Record<string, string> {
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
    // Spawn writes pwshHome before this call. pwsh ignores PS1/PROMPT_COMMAND;
    // the isolated profile under that home installs the prompt. NO_COLOR
    // keeps the renderer quiet.
    const home = pwshHome as string
    return {
      ...common,
      NO_COLOR: '1',
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, '.config'),
    }
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
/**
 * Isolated-profile replacement for PSReadLine. Keeping HOME until close still
 * left later PTY writes empty or aborted (`32474124270`: empty `keep=ok`,
 * `PTY send aborted before write`). The console host calls this function when
 * it exists, so a submitted line reaches `[Console]::ReadLine`.
 */
export const PWSH_CONSOLE_READLINE =
  'Remove-Module PSReadLine -Force -ErrorAction SilentlyContinue; function global:PSConsoleHostReadLine { [Console]::ReadLine() }'
async function writePwshIsolatedHome(): Promise<string> {
  const home = join(tmpdir(), `dsh-pwsh-home-${randomUUID()}`)
  const body = `${ENCODING_PREAMBLE}\n${PWSH_PROMPT_SETUP}\n${PWSH_CONSOLE_READLINE}\n`
  const profiles = [
    join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'),
    join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
  ]
  for (const profile of profiles) {
    await mkdir(dirname(profile), { recursive: true })
    await writeFile(profile, body)
  }
  return home
}

function spawnArgv(
  ctx: Context,
  config: ResolvedConfig,
  policy: SandboxExecutionPolicy,
  pwshHome?: string,
): string[] {
  const shellArgs = pwshHome === undefined
    ? config.shellArgs
    : config.shellArgs.filter(arg => arg !== '-NoProfile')
  const argv = [config.shellPath, ...shellArgs]
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
function startupTimeoutError(viewport: string, scrollback?: string): Error {
  const scrollbackPart = scrollback === undefined ? '' : `; scrollback=${JSON.stringify(scrollback.slice(-400))}`
  return new Error(
    `PTY shell did not reach readiness before startup timeout; viewport=${JSON.stringify(viewport.slice(-400))}${scrollbackPart}`,
  )
}

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
    // pwsh cannot install its prompt from the environment. Interactive
    // writes after `PS …>` never execute on Linux CI: `-NoExit -File`
    // (32470697182) and an isolated HOME that still used PSReadLine
    // (32474124270) printed the token then dropped later sends. The
    // isolated profile therefore replaces PSReadLine with
    // PSConsoleHostReadLine. Wait for PWSH_SETUP_DONE and
    // CONTROLLED_PROMPT, and keep the home until session close.
    // session_exit, per-send timeout, and the spawn-wall timeoutMs reject.
    const startedAt = Date.now()
    let viewport = ''
    let sawToken = false
    for (;;) {
      const operation = session.startSend({
        text: '',
        submit: false,
        ...signal !== undefined ? { signal } : {},
      })
      const result = await operation.done
      if (result.waitReason === 'session_exit') throw new Error('PTY shell exited during startup')
      if (result.waitReason === 'timeout') throw startupTimeoutError(result.viewport)
      viewport = result.viewport
      const scrollback = session.read({ offset: 0, count: 20 }).text
      if (viewport.includes(PWSH_SETUP_DONE) || scrollback.includes(PWSH_SETUP_DONE)) {
        if (!sawToken) {
          session.motd = viewport.includes(PWSH_SETUP_DONE) ? viewport : scrollback
          sawToken = true
        }
        if (viewport.includes(CONTROLLED_PROMPT) || scrollback.includes(CONTROLLED_PROMPT)) break
      }
      if (Date.now() - startedAt >= timeoutMs) throw startupTimeoutError(viewport, scrollback)
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
    const pwshHome = this.config.shellDialect === 'pwsh' ? await writePwshIsolatedHome() : undefined
    const argv = spawnArgv(this.ctx, this.config, policy, pwshHome)
    if (argv[0] === undefined) throw new Error('terminal-bash: sandbox returned empty argv')
    let session: LocalPtySession | undefined
    try {
      const terminal = await this.spawnTerminal({
        argv,
        cwd: spec.cwd ?? policy.workspaceRoot,
        env: childEnvironment(spec, this.config.shellDialect, pwshHome),
        rows: this.config.rows,
        cols: this.config.cols,
        graceMs: this.config.disposeGraceMs,
        signal: spec.signal,
      })
      session = this.createSession(terminal, this.config)
      if (pwshHome !== undefined) {
        const previousClose = session.close
        session.close = async (reason: string) => {
          try {
            if (typeof previousClose === 'function') await previousClose.call(session, reason)
          } finally {
            await rm(pwshHome, { recursive: true, force: true })
          }
        }
      }
      await startupSession(session, this.config.shellDialect, this.config.timeoutMs, spec.signal)
      return session
    } catch (error) {
      if (session !== undefined) {
        try {
          await session.close('PTY startup failed')
        } catch (closeError: unknown) {
          throw new TerminalBackendCleanupError(error, closeError)
        }
      } else if (pwshHome !== undefined) {
        await rm(pwshHome, { recursive: true, force: true })
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
