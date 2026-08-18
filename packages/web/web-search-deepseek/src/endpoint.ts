/**
 * Classify the shipped search provider's configured endpoint into a wire format.
 * Gestalt pins `searchProvider: deepseek-official` and one settings card, so this
 * package speaks both DeepSeek Messages search and Moonshot's dedicated search
 * URL instead of registering a second selected provider.
 * @module @deepseek-ai/dsh-web-search-deepseek/endpoint
 */

/** Wire format chosen from the configured search `baseURL`. */
export type SearchWireFormat = 'deepseek-messages' | 'moonshot-search'

/**
 * Hosts whose default public search API is Moonshot dedicated search
 * (`POST` the configured URL as-is with `text_query`). A path that still
 * contains `/anthropic` or `/coding` stays on DeepSeek Messages: Kimi's
 * coding API is Anthropic-compatible (`POST {baseURL}/messages`).
 */
export const MOONSHOT_SEARCH_HOSTS: ReadonlySet<string> = new Set([
  'api.moonshot.cn',
  'api.moonshot.ai',
])

/**
 * Choose the search wire format for one configured `baseURL`.
 *
 * `/anthropic` or `/coding` in the path always selects DeepSeek Messages
 * (`POST {baseURL}/messages`). Otherwise a known Moonshot search host, or a
 * path that ends in `/search`, selects Moonshot dedicated search (`POST` the
 * URL as-is). Every other parseable URL, and any unparseable value, stays on
 * DeepSeek Messages.
 *
 * @param baseURL - the provider section's endpoint, which may be a DeepSeek
 *   Anthropic base, a Kimi coding Anthropic base, or a full Moonshot search URL.
 * @returns the wire format the next search must speak.
 */
export function classifySearchEndpoint(baseURL: string): SearchWireFormat {
  if (!URL.canParse(baseURL)) return 'deepseek-messages'
  const url = new URL(baseURL)
  const path = url.pathname.replace(/\/+$/u, '')
  if (path.includes('/anthropic') || path.includes('/coding')) return 'deepseek-messages'
  if (MOONSHOT_SEARCH_HOSTS.has(url.hostname.toLowerCase()) || path.endsWith('/search')) {
    return 'moonshot-search'
  }
  return 'deepseek-messages'
}
