/** Navigation decisions for the single trusted Desktop window. */
export type NavigationDecision = 'host' | 'external' | 'deny'

/**
 * Classify a requested URL against the active loopback Web Host.
 * @param requestedUrl - navigation or window-open target.
 * @param hostUrl - active Web Host URL, including its assigned port.
 * @returns host for same-origin navigation, external for ordinary web links, otherwise deny.
 */
export function classifyNavigation(requestedUrl: string, hostUrl: string | undefined): NavigationDecision {
  let requested: URL
  try {
    requested = new URL(requestedUrl)
  } catch {
    return 'deny'
  }
  if (hostUrl !== undefined) {
    try {
      if (requested.origin === new URL(hostUrl).origin) return 'host'
    } catch {
      return 'deny'
    }
  }
  if (requested.protocol !== 'http:' && requested.protocol !== 'https:') return 'deny'
  if (isLoopback(requested.hostname)) return 'deny'
  return 'external'
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}
