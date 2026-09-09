/** Browser-safe file-address helpers used by the official file tab. */

/** Parsed `dsh-resource://file` identity with an explicit authorizing Session. */
export type OfficialFileAddress = {
  readonly scope: 'session'
  readonly sessionId: string
  readonly path: string
}

/** Decode one official file address. */
export function parseOfficialFileAddress(address: string): OfficialFileAddress | undefined {
  try {
    const url = new URL(address)
    if (url.protocol !== 'dsh-resource:' || url.host !== 'file') return undefined
    const [, scope, sessionId, ...segments] = url.pathname.split('/')
    if (scope !== 'session' || sessionId === undefined || sessionId === '' || segments.length === 0) {
      return undefined
    }
    return {
      scope,
      sessionId: decodeURIComponent(sessionId),
      path: segments.map(decodeURIComponent).join('/'),
    }
  } catch {
    return undefined
  }
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/giu, ':')
}

/** Address one path under the Session that authorizes its filesystem access. */
export function officialFileAddress(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''
  const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith('//')
  const ownedPath = !absolute
    ? normalized.replace(/^\.\//, '')
    : normalized === root || (root !== '' && normalized.startsWith(`${root}/`))
      ? normalized.slice(root.length).replace(/^\/+/, '')
      : normalized
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${ownedPath.split('/').map(encodeSegment).join('/')}`
}

/** Final path segment shown on the tab chip. */
export function officialFileTitle(address: string): string {
  const parsed = parseOfficialFileAddress(address)
  if (parsed === undefined) return address
  const at = Math.max(parsed.path.lastIndexOf('/'), parsed.path.lastIndexOf('\\'))
  return parsed.path.slice(at + 1) || parsed.path
}
