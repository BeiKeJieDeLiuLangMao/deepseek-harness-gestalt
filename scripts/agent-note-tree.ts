/**
 * Shared structural source of truth for the Agent Note tree. Lifecycle and class
 * sets are closed under `.agents/notes/README.md`; importing this module is pure.
 */

import { globSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export const agentNoteRoot = resolve(import.meta.dirname, '../.agents/notes')

/** The closed set of active Agent Note lifecycles (top-level folders under .agents/notes/). */
const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const

/**
 * The closed set of Agent Note classes (nested folder under each lifecycle). Adding a
 * class is a deliberate act: extend this list AND the README's Classification
 * section. The gate rejects any folder not listed here.
 */
export const AGENT_NOTE_CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'] as const

/** Writer-facing reminder that GitHub area labels are not Agent Note classes. */
export const AGENT_NOTE_CLASS_VS_AREA =
  'Class is the nested folder from the closed six; GitHub `area/*` / "platform/infra" is not a class.'

/** Historical implemented notes live outside the active lifecycle tree. */
const AGENT_NOTE_ARCHIVE = 'archived'

/** Non-Agent Note Markdown allowed to sit directly at a lifecycle root. */
const ROOT_ALLOWLIST = new Set(['AGENTS.md', 'CLAUDE.md'])

/** One Agent Note file, as discovered by the walker. */
export interface AgentNote {
  lifecycle: string
  /** Path relative to .agents/notes. */
  rel: string
  /** `yyyy-mm-dd` from the filename. */
  date: string
}

/** Result of a cheap `{lifecycle}/{class}/file.md` path check. */
export interface AgentNotePathInspection {
  note?: AgentNote
  error?: string
}

/**
 * Check one active-tree relative path without walking the notes directory.
 * Pairing owns incomplete EN+ZH+sidecar triplets; this check owns class folders.
 */
export function inspectActiveAgentNotePath(rel: string): AgentNotePathInspection {
  const match = rel.split(sep).join('/')
  const segs = match.split('/')
  const lifecycle = segs[0]
  if (lifecycle === undefined || !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(lifecycle)) {
    return { error: `structure: ${match} — expected {lifecycle}/{class}/file.md under ${AGENT_NOTE_LIFECYCLES.join(', ')}` }
  }
  // Allowlisted file directly at the lifecycle root (e.g. implemented/AGENTS.md).
  if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) return {}
  const cls = segs[1]
  const base = segs[2]
  if (cls !== undefined && !(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
    return {
      error: `structure: ${match} — unknown class folder "${cls}" (allowed: ${AGENT_NOTE_CLASSES.join(', ')}). ${AGENT_NOTE_CLASS_VS_AREA}`,
    }
  }
  if (segs.length !== 3 || cls === undefined || base === undefined) {
    return { error: `structure: ${match} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})` }
  }
  // A Chinese counterpart (foo.zh.md) is the SAME Agent Note,
  // indexed via its English filename; the pairing gate owns its consistency.
  if (match.endsWith('.zh.md')) return {}
  if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(base)) {
    return { error: `structure: ${match} — filename must be yyyy-mm-dd-topic.md` }
  }
  return { note: { lifecycle, rel: match, date: base.slice(0, 10) } }
}

/**
 * Walk the Agent Note tree, enforcing the structure rules. Returns every valid Agent Note
 * plus one error string per violation (unknown lifecycle or class folder, bad
 * depth, or bad filename). Callers treat a non-empty error list as fatal.
 */
export function walkAgentNoteTree(): { notes: AgentNote[]; errors: string[] } {
  const notes: AgentNote[] = []
  const errors: string[] = []
  // The lifecycle set is closed too: any directory under .agents/notes/ that is not
  // a known lifecycle would otherwise hold Agent Notes invisible to the walk below.
  for (const entry of readdirSync(agentNoteRoot, { withFileTypes: true })) {
    if (entry.name === 'INDEX.md') {
      errors.push('structure: INDEX.md — centralized Agent Note indexes are forbidden; browse the lifecycle/class tree or search the repository')
      continue
    }
    if (entry.isDirectory()
      && entry.name !== AGENT_NOTE_ARCHIVE
      && !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)) {
      errors.push(`structure: ${entry.name}/ — unknown lifecycle folder (allowed: ${AGENT_NOTE_LIFECYCLES.join(', ')}, plus ${AGENT_NOTE_ARCHIVE}/)`)
    }
  }
  for (const lifecycle of AGENT_NOTE_LIFECYCLES) {
    for (const match of globSync(`${lifecycle}/**/*.md`, { cwd: agentNoteRoot }).map(path => path.split(sep).join('/')).sort()) {
      const inspected = inspectActiveAgentNotePath(match)
      if (inspected.error !== undefined) errors.push(inspected.error)
      if (inspected.note !== undefined) notes.push(inspected.note)
    }
  }
  return { notes, errors }
}
