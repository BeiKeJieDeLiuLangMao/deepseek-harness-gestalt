/**
 * Parse the loopback URL printed by `dsh web` after the Loader settles.
 * @module @deepseek-ai/dsh-desktop/web-url
 */

/** Matches the `dsh web: http://127.0.0.1:<port>` announcement line. */
export const WEB_URL_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m

/**
 * Extract the loopback Web Host URL from mixed stdout.
 * @param chunk - one or more stdout chunks.
 * @returns the URL, or undefined when the announcement has not appeared.
 */
export function webUrlFromOutput(chunk: string): string | undefined {
  return WEB_URL_LINE.exec(chunk)?.[1]
}
