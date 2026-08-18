/**
 * Moonshot/Kimi dedicated search (`POST` the configured URL with `text_query`).
 * The official client is Kimi CLI's `moonshot_search` service; this module maps
 * that retrieval envelope into the web seam's `WebSearchResult`.
 * @module @deepseek-ai/dsh-web-search-deepseek/moonshot
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Default `limit` when a request carries no `maxResults`. Matches Kimi CLI. */
export const MOONSHOT_DEFAULT_LIMIT = 5

/** Moonshot rejects `limit` above this value. */
export const MOONSHOT_MAX_LIMIT = 20

/** Server-side retrieval budget sent as `timeout_seconds`. Matches Kimi CLI. */
export const MOONSHOT_TIMEOUT_SECONDS = 30

/** One citeable hit inside Moonshot's `search_results[]`. */
export interface MoonshotSearchHit {
  url?: string | null
  title?: string | null
  snippet?: string | null
  date?: string | null
  site_name?: string | null
  content?: string | null
}

/** Moonshot dedicated-search response envelope. */
export interface MoonshotSearchResponse {
  search_results?: MoonshotSearchHit[]
}

/** Moonshot error envelope (best-effort; fields vary). */
export interface MoonshotSearchError {
  error?: { message?: string } | string
  message?: string
}

/** Secret-free JSON body posted to a Moonshot dedicated search URL. */
export interface MoonshotSearchRequestBody {
  readonly text_query: string
  readonly limit: number
  readonly enable_page_crawling: false
  readonly timeout_seconds: number
}

/**
 * Clamp a seam `maxResults` into Moonshot's `limit` range. A missing or
 * non-positive value uses {@link MOONSHOT_DEFAULT_LIMIT}; values above
 * {@link MOONSHOT_MAX_LIMIT} are capped.
 *
 * @param maxResults - the seam's optional source bound.
 * @returns a `limit` Moonshot accepts.
 */
export function moonshotSearchLimit(maxResults?: number): number {
  if (maxResults === undefined || !Number.isInteger(maxResults) || maxResults < 1) {
    return MOONSHOT_DEFAULT_LIMIT
  }
  return Math.min(MOONSHOT_MAX_LIMIT, maxResults)
}

/**
 * Build the dedicated-search JSON body. Page crawling stays off so a search
 * never pulls full-page text into the conversation model.
 *
 * @param query - the model-facing search query.
 * @param maxResults - the seam's optional source bound.
 * @returns the secret-free request body.
 */
export function moonshotSearchBody(query: string, maxResults?: number): MoonshotSearchRequestBody {
  return {
    text_query: query,
    limit: moonshotSearchLimit(maxResults),
    enable_page_crawling: false,
    timeout_seconds: MOONSHOT_TIMEOUT_SECONDS,
  }
}

/**
 * Map one Moonshot hit to a normalized source, or `undefined` when it carries
 * no URL. Full-page `content` is dropped: the seam's portable snippet is
 * `snippet`, and inventing one from crawled HTML would lie about retrieval.
 *
 * @param hit - one entry of Moonshot's `search_results[]`.
 * @returns the normalized source, or `undefined` when `url` is empty.
 */
export function mapMoonshotHit(hit: MoonshotSearchHit): WebSearchSource | undefined {
  const url = hit.url
  if (url == null || url.length === 0) return undefined
  return {
    url,
    ...hit.title != null && hit.title.length > 0 ? { title: hit.title } : {},
    ...hit.snippet != null && hit.snippet.length > 0 ? { snippet: hit.snippet } : {},
    ...hit.date != null && hit.date.length > 0 ? { publishedAt: hit.date } : {},
  }
}

/**
 * Map a Moonshot dedicated-search envelope to a normalized result. Dedupes by
 * `url` (first wins). The web service owns the final `maxResults` truncation,
 * so `truncated` is always `false` here.
 *
 * @param response - the parsed dedicated-search response body.
 * @returns the normalized result with URL-deduped sources.
 * @throws {@link WebError} when the envelope has no `search_results` array.
 */
export function mapMoonshotResponse(response: MoonshotSearchResponse): WebSearchResult {
  if (!Array.isArray(response.search_results)) {
    throw new WebError(
      'Moonshot returned no search_results; the dedicated search endpoint produced no result list',
      'WEB_PROVIDER_ERROR',
    )
  }
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const hit of response.search_results) {
    const source = mapMoonshotHit(hit)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  return { sources, truncated: false }
}
