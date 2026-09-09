/** Electron system-network adapters for Desktop-owned Platform HTTP and Relay WSS. */

import type { Agent } from 'node:http'
import { HttpsProxyAgent } from 'https-proxy-agent'

/** One ordered Electron proxy directive for a Relay connection attempt. */
export interface DesktopRelayProxyCandidate {
  /** Native HTTP CONNECT agent; absence means a direct connection. */
  agent?: Agent
  /** Credential-free proxy URL suitable for the system-Node Relay helper. */
  proxyUrl?: string
  /** Content-free directive used for diagnostics and tests. */
  directive: 'DIRECT' | 'PROXY' | 'HTTPS'
}

/**
 * Preserve the ordered connection candidates from Electron proxy resolution rules.
 * @param rules - Semicolon-delimited result from `Session.resolveProxy`.
 * @returns ordered CONNECT and direct candidates.
 * @throws {TypeError} when a non-empty result has no supported candidate, or a
 * supported proxy directive is invalid.
 */
export function desktopRelayProxyCandidates(rules: string): readonly DesktopRelayProxyCandidate[] {
  const candidates: DesktopRelayProxyCandidate[] = []
  let firstUnsupported: string | undefined
  for (const rawDirective of rules.split(';')) {
    const directive = rawDirective.trim()
    if (directive === '') continue
    if (directive === 'DIRECT') {
      candidates.push({ directive: 'DIRECT' })
      continue
    }
    const proxyType = /^(PROXY|HTTPS)(?:\s|$)/u.exec(directive)?.[1]
    if (proxyType === undefined) {
      firstUnsupported ??= directive.split(/\s+/u)[0]
      continue
    }
    const match = /^(PROXY|HTTPS)\s+(\S+)$/u.exec(directive)
    if (match === null) throw new TypeError('Desktop Relay system proxy is invalid')
    const protocol = match[1] === 'HTTPS' ? 'https:' : 'http:'
    const authority = match[2]
    if (authority === undefined) throw new TypeError('Desktop Relay system proxy has no authority')
    const url = new URL(`${protocol}//${authority}`)
    if (url.hostname === '' || url.port === '') throw new TypeError('Desktop Relay system proxy is invalid')
    if (url.username !== '' || url.password !== '') {
      throw new TypeError('Desktop Relay system proxy must not contain credentials')
    }
    candidates.push({
      directive: proxyType as 'PROXY' | 'HTTPS',
      agent: new HttpsProxyAgent(url),
      proxyUrl: url.href,
    })
  }
  if (candidates.length > 0) return candidates
  if (firstUnsupported !== undefined) {
    throw new TypeError(`Desktop Relay system proxy directive is unsupported: ${firstUnsupported}`)
  }
  return [{ directive: 'DIRECT' }]
}
