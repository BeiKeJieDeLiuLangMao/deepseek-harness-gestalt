/**
 * Browser-side lexical workspace confinement. Host `confinedRelative` uses
 * `node:path` and is not a client-safe import; this string check refuses an
 * absolute, drive, or UNC token and any `..` segment.
 */

const WINDOWS_DRIVE = /^[A-Za-z]:/

/**
 * Return `token` when it cannot lexically leave the workspace, otherwise
 * `undefined`. Unlike host `confinedRelative`, a `..` segment is never
 * collapsed (`foo/../bar` is refused).
 * @param token - scanned draft mention without a leading `@`.
 * @returns the token, or `undefined` when it escapes.
 */
export function confinedDraftPath(token: string): string | undefined {
  if (token === '') return undefined
  if (token.startsWith('/') || token.startsWith('\\') || WINDOWS_DRIVE.test(token)) {
    return undefined
  }
  if (token.split(/[/\\]/).some(segment => segment === '..')) return undefined
  return token
}
