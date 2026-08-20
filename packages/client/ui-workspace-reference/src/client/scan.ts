/**
 * Picker filters and the paste-ignore mark. Host scan still owns `@path`
 * token recognition on submit.
 */

/** Word joiner inserted after `@` on paste so the token is not a Workspace Reference. */
export const PASTE_IGNORE_MARK = '\u2060'

/**
 * Keep indexed paths that pass Exact/Regex basename filters.
 * @param files - indexed entries.
 * @param exact - basename substring; empty disables.
 * @param regex - basename regular expression; empty or invalid disables.
 * @returns the entries whose basename passes both filters.
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

/**
 * True when `regex` is non-empty and does not compile. Empty input is not an
 * error; filtering stays off (fail-open) until the pattern compiles.
 * @param regex - basename filter text.
 * @returns whether Settings should show the invalid-regex error.
 */
export function invalidBasenameRegex(regex: string): boolean {
  if (regex === '') return false
  try {
    void new RegExp(regex)
    return false
  } catch {
    return true
  }
}

function compileFilter(regex: string): RegExp | undefined {
  if (regex === '' || invalidBasenameRegex(regex)) return undefined
  return new RegExp(regex)
}
