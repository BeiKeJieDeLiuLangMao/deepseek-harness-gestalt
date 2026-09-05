/**
 * Parse the loopback URL printed by `dsh web` after the Loader settles.
 * @module @deepseek-ai/dsh-desktop/web-url
 */

/** Matches the `dsh web: http://127.0.0.1:<port>/?token=…` announcement line. */
const WEB_URL_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/?[^\s]*)/m

/** Loopback Web Host origin and the process launch URL that still carries `?token=`. */
export interface WebHostAnnouncement {
  /** Public origin used for navigation, overlay, and Host/Origin checks. */
  readonly origin: string
  /** Authenticated startup URL; Desktop Host exchanges it once and never logs it. */
  readonly launchUrl: string
}

/**
 * Extract the loopback Web Host origin and launch URL from mixed stdout.
 * @param chunk - one or more stdout chunks.
 * @returns the announcement, or undefined when it has not appeared.
 */
export function webHostAnnouncementFromOutput(chunk: string): WebHostAnnouncement | undefined {
  const raw = WEB_URL_LINE.exec(chunk)?.[1]
  if (raw === undefined) return undefined
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.port === '') {
    return undefined
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') return undefined
  const origin = `http://127.0.0.1:${parsed.port}`
  parsed.pathname = '/'
  parsed.hash = ''
  return { origin, launchUrl: parsed.href }
}

/**
 * Extract the public loopback origin from mixed stdout.
 * @param chunk - one or more stdout chunks.
 * @returns the origin, or undefined when the announcement has not appeared.
 */
export function webUrlFromOutput(chunk: string): string | undefined {
  return webHostAnnouncementFromOutput(chunk)?.origin
}
