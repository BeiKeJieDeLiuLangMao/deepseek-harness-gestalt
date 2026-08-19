/**
 * Host-side Workspace Reference marker. Recognizes `@path` tokens in
 * `source.kind === 'user'` text, validates each path with `lstat`, and injects
 * only path and kind. File bytes and directory children are never read.
 */
import { isAbsolute } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { MentionFileSystem, WorkspaceReferenceSource } from './types.ts'

/** `@` then a path with no whitespace, `@`, or `[` (so `@[label](uri)` stays a Session Reference). */
const MENTION_PATTERN = /@([^\s@[\]]+)/g

/**
 * Scan one text block for `@path` tokens, deduplicated in first-seen order.
 * A trailing slash is stripped. Markdown Session References are not matches.
 * @param text - one user text block.
 * @returns unique workspace-relative tokens.
 */
export function scanMentions(text: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    const relative = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
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
 * @param relative - workspace-relative path.
 * @param pathKind - validated file or directory.
 * @returns one self-closing workspace-reference tag.
 */
export function referenceForm(relative: string, pathKind: 'file' | 'directory'): string {
  return `<workspace-reference path="${escapeAttribute(relative)}" kind="${pathKind}" />`
}

/**
 * Expand validated `@path` mentions into sourced user messages.
 * @param messages - claimed step messages.
 * @param cwd - session workspace directory.
 * @param fileSystem - `lstat` implementation.
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
  const injections: UserMessage[] = []
  for (const token of tokens) {
    signal.throwIfAborted()
    if (token === '' || isAbsolute(token) || token.includes('..')) continue
    const info = await fileSystem.lstat(token, { cwd }, signal)
    signal.throwIfAborted()
    if (info === undefined || info.type === 'symlink' || info.type === 'other') continue
    const pathKind = info.type === 'directory' ? 'directory' : 'file'
    const source: WorkspaceReferenceSource = {
      kind: 'workspace-reference',
      path: token,
      pathKind,
    }
    injections.push(createUserMessage({
      content: [{ type: 'text', text: referenceForm(token, pathKind) }],
      source,
    }))
  }
  return injections
}

/**
 * `agent/pre-step` body: append validated Workspace Reference markers.
 * @param cwd - session workspace directory.
 * @param fileSystem - `lstat` implementation.
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
