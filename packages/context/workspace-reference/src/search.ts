/**
 * Pure picker ranking. A plain query matches basenames only. A query
 * containing `/` matches path segments in order. An empty query is
 * directories-first alphabetical browse.
 *
 * Portions derived from omdsh-dev/dsh-at-file 0.6.3 (MIT).
 * Copyright (c) 2026 dsh-at-file contributors. See NOTICE.
 */

/** One indexed workspace path. Browser ranking shares this record. */
export interface WorkspacePathEntry {
  /** Workspace-relative path using `/` separators. */
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/**
 * Rank the top `limit` paths matching `query`.
 * @param files - indexed workspace entries.
 * @param query - raw picker query after `@`.
 * @param limit - maximum results.
 * @returns the top matching entries.
 */
export function rankFiles(
  files: readonly WorkspacePathEntry[],
  query: string,
  limit: number,
): readonly WorkspacePathEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') {
    return [...files].sort(byDefault).slice(0, limit)
  }
  return files
    .map(file => ({ file, score: scorePath(file.relative, q) }))
    .filter(entry => entry.score >= 0)
    .sort((left, right) => right.score - left.score
      || (left.file.kind === 'dir' ? 1 : 0) - (right.file.kind === 'dir' ? 1 : 0)
      || left.file.relative.length - right.file.relative.length
      /* v8 ignore start -- last-resort lexicographic order */
      || (left.file.relative < right.file.relative ? -1 : 1))
  /* v8 ignore stop */
    .slice(0, limit)
    .map(entry => entry.file)
}

/** Directories first, then files, each group alphabetical. */
function byDefault(left: WorkspacePathEntry, right: WorkspacePathEntry): number {
  if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
  /* v8 ignore next -- identical relatives compare equal */
  return left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
}

/** Score one relative path against a normalized query. */
function scorePath(path: string, query: string): number {
  const lowerPath = path.toLowerCase()
  const pathSegments = lowerPath.split('/')
  const normalizedQuery = query.replaceAll('\\', '/')
  const querySegments = normalizedQuery.split('/').filter(Boolean)
  if (!normalizedQuery.includes('/')) {
    /* v8 ignore next -- split always yields a last segment and a basename query */
    return scoreName(pathSegments.at(-1) ?? '', querySegments[0] ?? '')
  }
  if (querySegments.length === 0) return -1
  if (normalizedQuery.endsWith('/')) {
    const prefix = normalizedQuery.slice(0, -1)
    if (!lowerPath.startsWith(`${prefix}/`)) return -1
    const depth = lowerPath.slice(prefix.length + 1).split('/').length
    return 6000 - (depth - 1) * 100 - path.length
  }
  let cursor = 0
  let total = 0
  let lastMatch = -1
  for (const querySegment of querySegments) {
    let matchedIndex = -1
    let matchedScore = -1
    for (let index = cursor; index < pathSegments.length; index += 1) {
      /* v8 ignore next -- index walks a non-empty split */
      const score = scoreName(pathSegments[index] ?? '', querySegment)
      if (score < 0) continue
      matchedScore = score
      matchedIndex = index
      break
    }
    if (matchedIndex < 0) return -1
    total += matchedScore
    lastMatch = matchedIndex
    cursor = matchedIndex + 1
  }
  const basenameBonus = lastMatch === pathSegments.length - 1 ? 1000 : 0
  return total + basenameBonus - path.length
}

/** Exact, prefix, substring, then compact subsequence scoring for one name. */
function scoreName(name: string, query: string): number {
  /* v8 ignore next -- callers never pass an empty segment after trim */
  if (query === '') return -1
  if (name === query) return 5000
  if (name.startsWith(query)) return 4500 - name.length
  const contained = name.indexOf(query)
  if (contained >= 0) return 4000 - contained * 10 - name.length
  let cursor = 0
  for (const char of query) {
    const next = name.indexOf(char, cursor)
    if (next < 0) return -1
    cursor = next + 1
  }
  return 1000 - cursor - name.length
}
