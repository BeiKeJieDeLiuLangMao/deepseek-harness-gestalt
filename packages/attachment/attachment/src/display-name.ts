/** Display-name stripping shared by image and opaque-byte admission. */

/**
 * Strip path separators and control characters from a caller-supplied display name.
 * A POSIX host treats `\` as an ordinary character, so `path.basename` would keep
 * a Windows client's full local path and leak it into the reference and the session log.
 * @param value - original display name, which may include Windows or POSIX path text.
 * @returns a leaf name of at most 255 characters, or undefined when nothing remains.
 */
export function displayName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const leaf = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1)
  const clean = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255)
  return clean === '' ? undefined : clean
}
