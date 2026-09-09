/** Browser-safe file-address helpers used by the official file tab. */
import { SessionId } from '@deepseek-ai/dsh-session/types'

/** Parsed `dsh-resource://file` identity with an explicit authorizing Session. */
export type OfficialFileAddress = {
  readonly scope: 'session'
  readonly sessionId: SessionId
  readonly path: string
}

/** Decode one official file address. */
export function parseOfficialFileAddress(address: string): OfficialFileAddress | undefined {
  const prefix = 'dsh-resource://file/session/'
  if (!address.startsWith(prefix)) return undefined
  const encoded = address.slice(prefix.length)
  const separator = encoded.indexOf('/')
  if (separator <= 0) return undefined
  try {
    const sessionId = decodeURIComponent(encoded.slice(0, separator))
    const path = encoded.slice(separator + 1).split('/').map(decodeURIComponent).join('/')
    if (encodeSegment(sessionId) !== encoded.slice(0, separator)) return undefined
    if (path.split('/').map(encodeSegment).join('/') !== encoded.slice(separator + 1)) return undefined
    return {
      scope: 'session',
      sessionId: SessionId(sessionId),
      path,
    }
  } catch {
    return undefined
  }
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/giu, ':')
}

/** Address one path under the Session that authorizes its filesystem access. */
export function officialFileAddress(sessionId: SessionId, cwd: string | undefined, path: string): string {
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
