/** Owned process and artifact lifecycle for the Desktop Electron smoke. */

import { execFileSync, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const TERMINATION_GRACE_MS = 1_000

/** Capture output and await one child exit exactly once. */
export function observeSmokeChild(child: ChildProcess): {
  readonly output: () => string
  readonly failure: () => Error | undefined
  readonly exited: Promise<void>
} {
  let text = ''
  let failure: Error | undefined
  const retain = (chunk: Buffer): void => { text += chunk.toString() }
  child.stdout?.on('data', retain)
  child.stderr?.on('data', retain)
  const exited = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolveExit, rejectExit) => {
      const cleanup = (): void => {
        child.off('exit', onExit)
        child.off('error', onError)
      }
      const onExit = (): void => { cleanup(); resolveExit() }
      const onError = (error: Error): void => { failure = error; cleanup(); rejectExit(error) }
      child.once('exit', onExit)
      child.once('error', onError)
    })
  void exited.catch(() => {})
  return { output: () => text, failure: () => failure, exited }
}

/** Request bounded TERM→KILL termination and wait until the owned child exits. */
export async function stopSmokeChild(child: ChildProcess | undefined, exited: Promise<void> | undefined): Promise<void> {
  if (child === undefined || exited === undefined) return
  if (child.exitCode !== null || child.signalCode !== null) return await exited
  child.kill('SIGTERM')
  if (await settlesWithin(exited, TERMINATION_GRACE_MS)) return
  child.kill('SIGKILL')
  if (!await settlesWithin(exited, TERMINATION_GRACE_MS)) {
    throw new Error(`Desktop smoke child ${String(child.pid)} did not exit after SIGKILL`)
  }
}

export interface SmokeHostIdentity {
  readonly origin: string
  readonly pid: number
  readonly started?: string
}

/** Parse the Host identity recorded by this smoke run. */
export function smokeHostIdentity(log: string): SmokeHostIdentity | undefined {
  const match = /(?:^|\n)host (http:\/\/127\.0\.0\.1:\d+) pid (\d+)(?:\n|$)/.exec(log)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const pid = Number(match[2])
  return Number.isSafeInteger(pid) && pid > 0 ? { origin: match[1], pid } : undefined
}

/** Fence a live logged Host against later PID reuse. */
export function captureSmokeHostIdentity(identity: SmokeHostIdentity): SmokeHostIdentity {
  return { ...identity, started: processStart(identity.pid) }
}

/** Stop a logged Host only when its live command carries this run's private DSH_HOME. */
export async function stopOwnedSmokeHost(identity: SmokeHostIdentity | undefined, dshHome: string): Promise<void> {
  if (identity === undefined || !processExists(identity.pid)) return
  if (process.platform === 'win32') {
    throw new Error('Desktop smoke Host ownership verification is unavailable on Windows')
  }
  if (identity.started === undefined || processStart(identity.pid) !== identity.started) return
  const command = processCommand(identity.pid)
  if (!command.includes(`DSH_HOME=${resolve(dshHome)}`) || !command.includes(identity.origin)) {
    throw new Error(`refusing to signal unverified Desktop smoke Host pid ${String(identity.pid)}`)
  }
  process.kill(identity.pid, 'SIGTERM')
  if (await processExitsWithin(identity.pid, TERMINATION_GRACE_MS)) return
  process.kill(identity.pid, 'SIGKILL')
  if (!await processExitsWithin(identity.pid, TERMINATION_GRACE_MS)) {
    throw new Error(`Desktop smoke Host ${String(identity.pid)} did not exit after SIGKILL`)
  }
}

function processStart(pid: number): string {
  return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).trim()
}

function processCommand(pid: number): string {
  return execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim()
}

function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function processExitsWithin(pid: number, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setInterval> | undefined
  return await new Promise((resolveExit) => {
    const deadline = Date.now() + ms
    timer = setInterval(() => {
      if (!processExists(pid)) {
        clearInterval(timer)
        resolveExit(true)
      } else if (Date.now() >= deadline) {
        clearInterval(timer)
        resolveExit(false)
      }
    }, 25).unref()
  })
}

async function settlesWithin(settlement: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      settlement.then(() => true),
      new Promise<false>((resolveTimeout) => { timer = setTimeout(() => { resolveTimeout(false) }, ms).unref() }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Retain smoke evidence outside the isolated home, then remove that home. */
export async function retainSmokeEvidence(options: {
  readonly evidencePath: string
  readonly root: string
  readonly smokeLog: string
  readonly processOutput: string
}): Promise<void> {
  const root = resolve(options.root)
  const evidence = resolve(options.evidencePath)
  const relation = relative(root, evidence)
  try {
    const insideRoot = relation === '' || (!isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`))
    if (insideRoot) {
      throw new Error('Desktop smoke evidence path must be outside the isolated root')
    }
    let smoke = ''
    try { smoke = await readFile(options.smokeLog, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(dirname(evidence), { recursive: true })
    await writeFile(evidence, `${smoke}\n--- electron output ---\n${options.processOutput}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
