/**
 * Draft-side Workspace Reference token scan. Matches the host scanner:
 * `@path` without whitespace, `@`, or `[`. Paste-marked tokens are ignored.
 */

/** Word joiner inserted after `@` on paste so the token is not a Workspace Reference. */
export const PASTE_IGNORE_MARK = '\u2060'

const MENTION_PATTERN = /@([^\s@[\]]+)/g

/**
 * Unique `@path` tokens in first-seen order. A trailing slash is stripped.
 * @param text - composer draft.
 */
export function scanDraftMentions(text: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    if (raw.includes(PASTE_IGNORE_MARK)) continue
    const relative = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
  }
  return out
}

/**
 * Remove one `@path` occurrence, including an optional trailing slash and space.
 * @param text - composer draft.
 * @param path - workspace-relative token without a leading `@`.
 */
export function removeDraftMention(text: string, path: string): string {
  const escaped = path.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`@${escaped}/? ?`), '')
}

/**
 * Keep indexed paths that pass Exact/Regex basename filters.
 * @param files - indexed entries.
 * @param exact - basename substring; empty disables.
 * @param regex - basename regular expression; empty or invalid disables.
 */
export function filterIndexedFiles<T extends { relative: string }>(
  files: readonly T[],
  exact: string,
  regex: string,
): readonly T[] {
  const pattern = compileFilter(regex)
  return files.filter((file) => {
    const base = file.relative.slice(Math.max(file.relative.lastIndexOf('/') + 1, 0))
    if (exact !== '' && !base.includes(exact)) return false
    return pattern === undefined || pattern.test(base)
  })
}

function compileFilter(regex: string): RegExp | undefined {
  if (regex === '') return undefined
  try {
    return new RegExp(regex)
  } catch {
    return undefined
  }
}
