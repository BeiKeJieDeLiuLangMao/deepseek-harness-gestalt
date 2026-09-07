/** Durable cross-process evidence for the critical-path Electron runner. */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CriticalPathPhase } from './keyless-model.ts'

const phases: readonly CriticalPathPhase[] = ['create', 'restore', 'archive']
const processFields = ['electronPid', 'hostPid', 'hostOrigin', 'rendererUrl'] as const

/** Owned process facts captured as soon as each process becomes observable. */
export interface PhaseProcessEvidence {
  readonly electronPid?: number
  readonly hostPid?: number
  readonly hostOrigin?: string
  readonly rendererUrl?: string
}

/**
 * Read a file that may not have been created yet; other failures remain fatal.
 * @param path - Artifact path to read.
 * @returns UTF-8 content, or undefined when the path does not exist.
 */
export async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Read all process evidence written by WDIO phases.
 * @param artifactRoot - Root directory shared by the phase workers.
 * @returns Validated partial evidence indexed by phase.
 */
export async function readProcessEvidence(
  artifactRoot: string,
): Promise<Partial<Record<CriticalPathPhase, PhaseProcessEvidence>>> {
  const text = await readOptionalFile(join(artifactRoot, 'processes.json'))
  if (text === undefined) return {}
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('critical-path processes.json must contain an object')
  }
  const source = parsed as Record<string, unknown>
  const unknownPhase = Object.keys(source).find(key => !phases.includes(key as CriticalPathPhase))
  if (unknownPhase !== undefined) {
    throw new TypeError(`critical-path processes.json contains unknown phase ${JSON.stringify(unknownPhase)}`)
  }
  const result: Partial<Record<CriticalPathPhase, PhaseProcessEvidence>> = {}
  for (const phase of phases) {
    const entry = source[phase]
    if (entry === undefined) continue
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new TypeError(`critical-path process evidence for ${phase} must contain an object`)
    }
    const record = entry as Record<string, unknown>
    const unknownField = Object.keys(record).find(key => !processFields.includes(key as typeof processFields[number]))
    if (unknownField !== undefined) {
      throw new TypeError(`critical-path ${phase} process evidence contains unknown field ${JSON.stringify(unknownField)}`)
    }
    const electronPid = optionalPid(record['electronPid'], phase, 'electronPid')
    const hostPid = optionalPid(record['hostPid'], phase, 'hostPid')
    const hostOrigin = optionalString(record['hostOrigin'], phase, 'hostOrigin')
    const rendererUrl = optionalString(record['rendererUrl'], phase, 'rendererUrl')
    result[phase] = {
      ...(electronPid === undefined ? {} : { electronPid }),
      ...(hostPid === undefined ? {} : { hostPid }),
      ...(hostOrigin === undefined ? {} : { hostOrigin }),
      ...(rendererUrl === undefined ? {} : { rendererUrl }),
    }
  }
  return result
}

/**
 * Merge newly observed facts into one phase's process evidence.
 * @param artifactRoot - Root directory shared by the phase workers.
 * @param phase - Phase whose owned process became observable.
 * @param evidence - Newly observed process fields.
 */
export async function recordProcessEvidence(
  artifactRoot: string,
  phase: CriticalPathPhase,
  evidence: PhaseProcessEvidence,
): Promise<void> {
  const current = await readProcessEvidence(artifactRoot)
  current[phase] = { ...current[phase], ...evidence }
  await writeFile(join(artifactRoot, 'processes.json'), JSON.stringify(current, undefined, 2) + '\n')
}

function optionalPid(value: unknown, phase: CriticalPathPhase, field: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`critical-path ${phase} ${field} must be a positive integer`)
  }
  return value as number
}

function optionalString(value: unknown, phase: CriticalPathPhase, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`critical-path ${phase} ${field} must be a non-empty string`)
  }
  return value
}
