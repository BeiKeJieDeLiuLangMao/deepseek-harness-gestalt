/** Owned process and artifact lifecycle for the Desktop Electron smoke. */

import type { ChildProcess } from 'node:child_process'
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
