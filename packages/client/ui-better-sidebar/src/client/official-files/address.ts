/** Browser-safe file-address helpers used by the official file tab. */
import {
  fileAddressFor,
  parseFileAddress,
  type FileAddress,
} from '@deepseek-ai/dsh-util-workspace-path'

/** Parsed `dsh-resource://file` identity. */
export type OfficialFileAddress = FileAddress

/** Decode one official file address. */
export function parseOfficialFileAddress(address: string): OfficialFileAddress | undefined {
  return parseFileAddress(address)
}

/** Address one path under the Session that authorizes its filesystem access. */
export function officialFileAddress(sessionId: string, cwd: string | undefined, path: string): string {
  return fileAddressFor(sessionId, cwd, path)
}

/** Final path segment shown on the tab chip. */
export function officialFileTitle(address: string): string {
  const parsed = parseOfficialFileAddress(address)
  if (parsed === undefined) return address
  const at = Math.max(parsed.path.lastIndexOf('/'), parsed.path.lastIndexOf('\\'))
  return parsed.path.slice(at + 1) || parsed.path
}
