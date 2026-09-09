/** Browser-safe file-address helpers used by the official file tab. */

/** Parsed `dsh-resource://file` identity. */
export type OfficialFileAddress =
  | { readonly scope: 'session'; readonly sessionId: string; readonly path: string }
  | { readonly scope: 'absolute'; readonly path: string }

/** Decode one official file address. */
export function parseOfficialFileAddress(address: string): OfficialFileAddress | undefined {
  try {
    const url = new URL(address)
    if (url.protocol !== 'dsh-resource:' || url.host !== 'file') return undefined
    const [, scope, ...rest] = url.pathname.split('/')
    if (scope === 'session') {
      const [sessionId, ...segments] = rest
      if (sessionId === undefined || sessionId === '' || segments.length === 0) return undefined
      return { scope, sessionId: decodeURIComponent(sessionId), path: segments.map(decodeURIComponent).join('/') }
    }
    if (scope !== 'absolute') return undefined
    const unc = rest[0] === '' && rest.length > 1
    const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
    if (segments.length === 0 || segments[0] === '') return undefined
    if (unc) return { scope, path: `//${segments.join('/')}` }
    const path = /^[A-Za-z]:$/.test(segments[0] ?? '') ? segments.join('/') : `/${segments.join('/')}`
    return { scope, path }
  } catch {
    return undefined
  }
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/** Address one path in the owning Session, keeping outside-workspace paths absolute. */
export function officialFileAddress(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''
  const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
  if (!absolute || normalized === root || (root !== '' && normalized.startsWith(`${root}/`))) {
    const relative = absolute ? normalized.slice(root.length).replace(/^\/+/, '') : normalized.replace(/^\.\//, '')
    return `dsh-resource://file/session/${encodeSegment(sessionId)}/${relative.split('/').map(encodeSegment).join('/')}`
  }
  const unc = normalized.startsWith('//')
  const pathWithoutRoot = normalized.replace(/^\/+/, '')
  return `dsh-resource://file/absolute/${unc ? '/' : ''}${pathWithoutRoot.split('/').map(encodeSegment).join('/')}`
}

/** Final path segment shown on the tab chip. */
export function officialFileTitle(address: string): string {
  const parsed = parseOfficialFileAddress(address)
  if (parsed === undefined) return address
  const at = Math.max(parsed.path.lastIndexOf('/'), parsed.path.lastIndexOf('\\'))
  return parsed.path.slice(at + 1) || parsed.path
}
