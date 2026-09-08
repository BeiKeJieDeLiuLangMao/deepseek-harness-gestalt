/** Durable cross-process evidence for the critical-path Electron runner. */

import { randomUUID } from 'node:crypto'
import {
  readFile, readdir, rename, rm, writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionId as SessionIdType } from '@deepseek-ai/dsh-session'
import { scanLog } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
import type { ProcessIdentity } from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'
import type { CriticalPathPhase } from './keyless-model.ts'

const phases: readonly CriticalPathPhase[] = ['create', 'restore', 'archive']
const processFields = ['electron', 'host', 'hostOrigin', 'ownedProcesses', 'rendererUrl'] as const
const processUpdates = new Map<string, Promise<void>>()

/** Owned process facts captured as soon as each process becomes observable. */
export interface PhaseProcessEvidence {
  readonly electron?: ProcessIdentity
  readonly host?: ProcessIdentity
  readonly hostOrigin?: string
  readonly ownedProcesses?: readonly ProcessIdentity[]
  readonly rendererUrl?: string
}

/** Cross-phase state retained by the critical-path acceptance. */
export interface SessionStateEvidence {
  readonly mainSessionId: SessionIdType
  readonly childId: SessionIdType
  readonly ownSideRequestCount: number
  readonly permissionPreset: string
  readonly closed?: true
  readonly archived?: true
}

/** Validated production Session JSONL used by the acceptance assertions. */
export interface StoredSessionLog {
  readonly path: string
  readonly header: {
    readonly id: SessionIdType
    readonly parentSession?: SessionIdType
    readonly origin?: string
  }
  readonly inheritedEventCount: number
  readonly events: readonly StoredSessionEvent[]
}

/** Validated envelope retained without assuming every plugin event declaration is loaded. */
export interface StoredSessionEvent {
  readonly seq: number
  readonly type: string
  readonly data: unknown
}

/** Secret-scan outcome that never carries matched content or an unsafe path. */
export type RetainedArtifactScan =
  | { readonly shareable: true; readonly removedFiles: number }
  | { readonly shareable: false }

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
 * @param artifactRoot - Exclusive root for this runner invocation.
 * @returns Validated partial evidence indexed by phase.
 */
export async function readProcessEvidence(
  artifactRoot: string,
): Promise<Partial<Record<CriticalPathPhase, PhaseProcessEvidence>>> {
  const text = await readOptionalFile(join(artifactRoot, 'processes.json'))
  if (text === undefined) return {}
  const source = record(JSON.parse(text), 'critical-path processes.json')
  const unknownPhase = Object.keys(source).find(key => !phases.includes(key as CriticalPathPhase))
  if (unknownPhase !== undefined) {
    throw new TypeError(`critical-path processes.json contains unknown phase ${JSON.stringify(unknownPhase)}`)
  }
  const result: Partial<Record<CriticalPathPhase, PhaseProcessEvidence>> = {}
  for (const phase of phases) {
    const value = source[phase]
    if (value === undefined) continue
    const entry = record(value, `critical-path process evidence for ${phase}`)
    rejectUnknownFields(entry, processFields, `critical-path ${phase} process evidence`)
    const electron = optionalProcessIdentity(entry['electron'], phase, 'electron')
    const host = optionalProcessIdentity(entry['host'], phase, 'host')
    const hostOrigin = optionalString(entry['hostOrigin'], phase, 'hostOrigin')
    const rendererUrl = optionalString(entry['rendererUrl'], phase, 'rendererUrl')
    const ownedProcesses = processIdentityArray(entry['ownedProcesses'], phase)
    const merged = mergeProcessIdentities(ownedProcesses ?? [], [electron, host].filter(isProcessIdentity))
    result[phase] = {
      ...(electron === undefined ? {} : { electron }),
      ...(host === undefined ? {} : { host }),
      ...(hostOrigin === undefined ? {} : { hostOrigin }),
      ...(merged.length === 0 ? {} : { ownedProcesses: merged }),
      ...(rendererUrl === undefined ? {} : { rendererUrl }),
    }
  }
  return result
}

/**
 * Merge newly observed facts into one phase's process evidence.
 * @param artifactRoot - Exclusive root for this runner invocation.
 * @param phase - Phase whose owned process became observable.
 * @param evidence - Newly observed process fields.
 */
export async function recordProcessEvidence(
  artifactRoot: string,
  phase: CriticalPathPhase,
  evidence: PhaseProcessEvidence,
): Promise<void> {
  const key = `${artifactRoot}\0${phase}`
  const previous = processUpdates.get(key) ?? Promise.resolve()
  const update = previous.then(async () => {
    const current = await readProcessEvidence(artifactRoot)
    const prior = current[phase]
    const ownedProcesses = mergeProcessIdentities(
      prior?.ownedProcesses ?? [],
      [
        ...(evidence.ownedProcesses ?? []),
        ...[evidence.electron, evidence.host].filter(isProcessIdentity),
      ],
    )
    current[phase] = {
      ...prior,
      ...evidence,
      ...(ownedProcesses.length === 0 ? {} : { ownedProcesses }),
    }
    const path = join(artifactRoot, 'processes.json')
    const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(current, undefined, 2) + '\n')
    await rename(temporary, path)
  })
  processUpdates.set(key, update)
  try {
    await update
  } finally {
    if (processUpdates.get(key) === update) processUpdates.delete(key)
  }
}

/**
 * Parse state passed between Electron phases.
 * @param text - Complete session-state.json text.
 * @returns Validated state with branded Session ids.
 */
export function parseSessionState(text: string): SessionStateEvidence {
  const value = record(JSON.parse(text), 'critical-path session-state.json')
  rejectUnknownFields(value, [
    'archived', 'childId', 'closed', 'mainSessionId', 'ownSideRequestCount', 'permissionPreset',
  ], 'critical-path session-state.json')
  return {
    mainSessionId: sessionId(value['mainSessionId'], 'mainSessionId'),
    childId: sessionId(value['childId'], 'childId'),
    ownSideRequestCount: nonNegativeInteger(value['ownSideRequestCount'], 'ownSideRequestCount'),
    permissionPreset: requiredString(value['permissionPreset'], 'permissionPreset'),
    ...optionalTrue(value['closed'], 'closed'),
    ...optionalTrue(value['archived'], 'archived'),
  }
}

/**
 * Parse one production Session JSONL through its persistence owner.
 * @param path - Physical log path used in diagnostics and evidence.
 * @param bytes - Complete physical log bytes.
 * @returns Validated metadata, inherited cut, and event prefix.
 */
export function parseStoredSessionLog(path: string, bytes: Buffer): StoredSessionLog {
  const scanned = scanLog(bytes)
  return {
    path,
    header: {
      id: scanned.meta.id,
      ...(scanned.meta.parentSession === undefined ? {} : { parentSession: scanned.meta.parentSession }),
      ...(scanned.meta.origin === undefined ? {} : { origin: scanned.meta.origin }),
    },
    inheritedEventCount: scanned.inheritedEventCount,
    events: scanned.events,
  }
}

/**
 * Parse the Workspace archive projection fields consumed by this acceptance.
 * @param text - Complete workspace.json text.
 * @returns Branded archived Session ids.
 */
export function parseArchivedSessionIds(text: string): SessionIdType[] {
  const document = record(JSON.parse(text), 'Workspace durable state')
  const global = record(document['global'], 'Workspace durable state global')
  const ids = global['archivedSessionIds']
  if (!Array.isArray(ids)) throw new TypeError('Workspace durable state exposed no archivedSessionIds array')
  return ids.map((value, index) => sessionId(value, `archivedSessionIds[${String(index)}]`))
}

/**
 * Confirm one new owned turn has one prompt, request, reply, and durable end in order.
 * @param log - Validated child Session log.
 * @param fromOwnEventCount - Owned-event cut captured before the prompt.
 * @param prompt - Unique prompt marker for this turn.
 * @param response - Expected assistant response marker.
 * @returns Whether the exact new turn is durably complete.
 */
export function hasExactCompletedOwnTurn(
  log: StoredSessionLog,
  fromOwnEventCount: number,
  prompt: string,
  response: string,
): boolean {
  const own = log.events.slice(log.inheritedEventCount)
  if (!Number.isInteger(fromOwnEventCount) || fromOwnEventCount < 0 || fromOwnEventCount > own.length) return false
  const suffix = own.slice(fromOwnEventCount)
  const users = matchingIndices(suffix, event => event.type === 'user/message'
    && JSON.stringify(event.data).includes(prompt))
  const requests = matchingIndices(suffix, event => event.type === 'request/header')
  const assistants = matchingIndices(suffix, event => event.type === 'assistant/message'
    && JSON.stringify(event.data).includes(response))
  const ended = matchingIndices(suffix, event => event.type === 'turn/end')
  if (users.length !== 1 || requests.length !== 1 || assistants.length !== 1 || ended.length !== 1) return false
  return users[0]! < requests[0]! && requests[0]! < assistants[0]! && assistants[0]! < ended[0]!
}

/**
 * Scan retained artifacts and remove files containing credential material.
 * @param artifactRoot - Exclusive artifact namespace to scan.
 * @param secretValues - Credential values captured before child environments are scrubbed.
 * @returns A shareability decision and safe count; scan failures expose no path or content.
 */
export async function scanRetainedArtifacts(
  artifactRoot: string,
  secretValues: readonly string[],
): Promise<RetainedArtifactScan> {
  try {
    let removedFiles = 0
    for (const path of await regularFiles(artifactRoot)) {
      const bytes = await readFile(path)
      if (!containsSecret(bytes, secretValues)) continue
      await rm(path)
      removedFiles += 1
    }
    return { shareable: true, removedFiles }
  } catch (_unsafeOrUnreadableArtifact) {
    return { shareable: false }
  }
}

/**
 * Redact credential values and generic credential assignments from one diagnostic.
 * @param text - Diagnostic text retained in result.json.
 * @param secretValues - Ambient credential values that must not be retained.
 * @returns Redacted diagnostic text.
 */
export function redactArtifactDiagnostic(text: string, secretValues: readonly string[]): string {
  let redacted = text
  for (const secret of secretValues) {
    if (secret.length > 0) redacted = redacted.replaceAll(secret, '[REDACTED]')
  }
  return redacted
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/gu, '[REDACTED PRIVATE KEY]')
    .replace(/((?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*(?:bearer\s+)?)[^\s"',;]{4,}/giu, '$1[REDACTED]')
}

function optionalProcessIdentity(
  value: unknown,
  phase: CriticalPathPhase,
  field: string,
): ProcessIdentity | undefined {
  if (value === undefined) return undefined
  const identity = record(value, `critical-path ${phase} ${field}`)
  rejectUnknownFields(identity, ['pid', 'started'], `critical-path ${phase} ${field}`)
  return {
    pid: positiveInteger(identity['pid'], `${phase} ${field}.pid`),
    started: requiredString(identity['started'], `${phase} ${field}.started`),
  }
}

function processIdentityArray(value: unknown, phase: CriticalPathPhase): ProcessIdentity[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new TypeError(`critical-path ${phase} ownedProcesses must contain an array`)
  return mergeProcessIdentities([], value.map((identity, index) => {
    const parsed = optionalProcessIdentity(identity, phase, `ownedProcesses[${String(index)}]`)
    if (parsed === undefined) throw new TypeError(`critical-path ${phase} ownedProcesses contains undefined`)
    return parsed
  }))
}

function mergeProcessIdentities(
  first: readonly ProcessIdentity[],
  second: readonly ProcessIdentity[],
): ProcessIdentity[] {
  const result = [...first]
  for (const identity of second) {
    const existing = result.find(candidate => candidate.pid === identity.pid)
    if (existing === undefined) result.push(identity)
    else if (existing.started !== identity.started) {
      throw new Error(`critical-path process evidence contains conflicting identities for PID ${String(identity.pid)}`)
    }
  }
  return result
}

function isProcessIdentity(value: ProcessIdentity | undefined): value is ProcessIdentity {
  return value !== undefined
}

function optionalString(value: unknown, phase: CriticalPathPhase, field: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, `${phase} ${field}`)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`critical-path ${field} must be a non-empty string`)
  }
  return value
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`critical-path ${field} must be a positive integer`)
  }
  return value as number
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`critical-path ${field} must be a non-negative integer`)
  }
  return value as number
}

function sessionId(value: unknown, field: string): SessionIdType {
  return SessionId(requiredString(value, field))
}

function optionalTrue(value: unknown, field: string): { [key: string]: true } {
  if (value === undefined) return {}
  if (value !== true) throw new TypeError(`critical-path ${field} must be true when present`)
  return { [field]: true }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must contain an object`)
  }
  return value as Record<string, unknown>
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  name: string,
): void {
  const unknown = Object.keys(value).find(key => !fields.includes(key))
  if (unknown !== undefined) throw new TypeError(`${name} contains unknown field ${JSON.stringify(unknown)}`)
}

function matchingIndices(
  events: readonly StoredSessionEvent[],
  predicate: (event: StoredSessionEvent) => boolean,
): number[] {
  return events.flatMap((event, index) => predicate(event) ? [index] : [])
}

async function regularFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error('critical-path artifact namespace contains a non-file entry')
    }
  }
  await visit(root)
  return files
}

function containsSecret(bytes: Buffer, secretValues: readonly string[]): boolean {
  for (const secret of secretValues) {
    if (secret.length > 0 && bytes.includes(Buffer.from(secret))) return true
  }
  const text = bytes.toString('utf8')
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)
    || /(?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*(?:bearer\s+)?[^\s"',;]{4,}/iu.test(text)
}
