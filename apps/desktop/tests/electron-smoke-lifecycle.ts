/** Owned process and artifact lifecycle for the Desktop Electron smoke. */

import type { ChildProcess } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Capture output and await one child exit exactly once. */
export function observeSmokeChild(child: ChildProcess): {
  readonly output: () => string
  readonly exited: Promise<void>
} {
  let text = ''
  const retain = (chunk: Buffer): void => { text += chunk.toString() }
  child.stdout?.on('data', retain)
  child.stderr?.on('data', retain)
  const exited = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => { child.once('exit', () => { resolve() }) })
  return { output: () => text, exited }
}

/** Request termination and wait until the owned child reaches exit. */
export async function stopSmokeChild(child: ChildProcess | undefined, exited: Promise<void> | undefined): Promise<void> {
  if (child === undefined || exited === undefined) return
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  await exited
}

/** Retain smoke evidence outside the isolated home, then remove that home. */
export async function retainSmokeEvidence(options: {
  readonly evidencePath: string
  readonly root: string
  readonly smokeLog: string
  readonly processOutput: string
}): Promise<void> {
  let smoke = ''
  try { smoke = await readFile(options.smokeLog, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await mkdir(dirname(options.evidencePath), { recursive: true })
  await writeFile(options.evidencePath, `${smoke}\n--- electron output ---\n${options.processOutput}`)
  await rm(options.root, { recursive: true, force: true })
}
