/**
 * Host-side Workspace Reference marker. Recognizes `@path` tokens in
 * `source.kind === 'user'` text, validates each path stays inside the session
 * workspace, and injects only path and kind. File bytes and directory children
 * are never read.
 *
 * Portions derived from omdsh-dev/dsh-at-file 0.6.3 (MIT).
 * Copyright (c) 2026 dsh-at-file contributors. See NOTICE.
 */
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { MentionFileSystem, WorkspaceReferenceSource } from './types.ts'

/** `@` then a path with no whitespace, `@`, or `[` (so `@[label](uri)` stays a Session Reference). */
const MENTION_PATTERN = /(?<![A-Za-z0-9._-])@([^\s@[\]]+)/g

/** Windows drive-relative token (`C:foo`) is not `path.isAbsolute` on either platform. */
const WINDOWS_DRIVE_RELATIVE = /^[A-Za-z]:(?![/\\]|$)/

/**
 * Scan one text block for `@path` tokens, deduplicated in first-seen order.
 * A trailing slash is stripped. Markdown Session References are not matches.
 * An `@` immediately after a word character is not a path token (`user@host.com`).
 * @param text - one user text block.
 * @returns unique workspace-relative tokens.
 */
export function scanMentions(text: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    const relativePath = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (relativePath === '' || seen.has(relativePath)) continue
    seen.add(relativePath)
    out.push(relativePath)
  }
  return out
}

/**
 * Escape one XML attribute without changing the referenced path identity.
 * @param value - raw attribute text.
 * @returns XML-safe attribute text.
 */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Render the model-visible existence marker.
 * @param relativePath - workspace-relative path.
 * @param pathKind - validated file or directory.
 * @returns one self-closing workspace-reference tag.
 */
export function referenceForm(relativePath: string, pathKind: 'file' | 'directory'): string {
  return `<workspace-reference path="${escapeAttribute(relativePath)}" kind="${pathKind}" />`
}

/**
 * Return the `/`-separated path of `token` inside `cwd`, or `undefined` when
 * the token is absolute, Windows drive-relative, or lexically leaves `cwd`.
 * @param cwd - absolute session workspace.
 * @param token - scanned mention token.
 * @returns workspace-relative path, or `undefined` when the token escapes.
 */
export function confinedRelative(cwd: string, token: string): string | undefined {
  if (
    token === ''
    || isAbsolute(token)
    || win32.isAbsolute(token)
    || WINDOWS_DRIVE_RELATIVE.test(token)
  ) {
    return undefined
  }
  const confined = relative(cwd, resolve(cwd, token))
  if (
    confined === '..'
    || confined.startsWith(`..${sep}`)
    || isAbsolute(confined)
    || win32.isAbsolute(confined)
  ) {
    return undefined
  }
  return confined.split(sep).join('/')
}

/**
 * Expand validated `@path` mentions into sourced user messages.
 * @param messages - claimed step messages.
 * @param cwd - session workspace directory.
 * @param fileSystem - `lstat` / `resolve` / `contains` implementation.
 * @param signal - caller lifetime.
 * @returns injections in first-seen order (empty when nothing validated).
 */
export async function expandMentions(
  messages: readonly UserMessage[],
  cwd: string | undefined,
  fileSystem: MentionFileSystem,
  signal: AbortSignal,
): Promise<UserMessage[]> {
  if (cwd === undefined || !isAbsolute(cwd)) return []
  const tokens: string[] = []
  const seen = new Set<string>()
  for (const message of messages) {
    if (message.source.kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      for (const token of scanMentions(block.text)) {
        if (seen.has(token)) continue
        seen.add(token)
        tokens.push(token)
      }
    }
  }
  if (tokens.length === 0) return []
  const injections: UserMessage[] = []
  const root = await fileSystem.resolve('.', { cwd, signal })
  for (const token of tokens) {
    signal.throwIfAborted()
    const confined = confinedRelative(cwd, token)
    if (confined === undefined) continue
    const relativePath = confined === '' ? '.' : confined
    const target = await fileSystem.resolve(relativePath, { cwd, signal })
    if (!fileSystem.contains(root, target)) continue
    const info = await fileSystem.lstat(relativePath, { cwd }, signal)
    signal.throwIfAborted()
    if (info === undefined || info.type === 'symlink' || info.type === 'other') continue
    const pathKind = info.type === 'directory' ? 'directory' : 'file'
    const source: WorkspaceReferenceSource = {
      kind: 'workspace-reference',
      path: relativePath,
      pathKind,
    }
    injections.push(createUserMessage({
      content: [{ type: 'text', text: referenceForm(relativePath, pathKind) }],
      source,
    }))
  }
  return injections
}

/**
 * `agent/pre-step` body: append validated Workspace Reference markers.
 * @param cwd - session workspace directory.
 * @param fileSystem - `lstat` / `resolve` / `contains` implementation.
 * @param messages - claimed user messages.
 * @param signal - caller lifetime.
 * @param next - downstream waterfall.
 * @returns the downstream decision, possibly with appended markers.
 */
export async function mentionPreStep(
  cwd: string | undefined,
  fileSystem: MentionFileSystem,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  const injections = await expandMentions(messages, cwd, fileSystem, signal)
  if (injections.length === 0) return decision
  return { kind: 'enter', messages: [...decision.messages, ...injections] }
}
