import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekSearchProvider } from '@deepseek-ai/dsh-web-search-deepseek'
import type { DeepSeekSearchProviderOptions } from '@deepseek-ai/dsh-web-search-deepseek'
import {
  mapMoonshotHit,
  mapMoonshotResponse,
  moonshotSearchBody,
  moonshotSearchLimit,
  MOONSHOT_DEFAULT_LIMIT,
  MOONSHOT_MAX_LIMIT,
  MOONSHOT_TIMEOUT_SECONDS,
} from '../src/moonshot.ts'

const searchProvider = (options: DeepSeekSearchProviderOptions): DeepSeekSearchProvider =>
  new DeepSeekSearchProvider(() => options)

const options = {
  apiKey: 'kimi-key',
  baseURL: 'https://api.moonshot.cn/v1/search',
  model: 'unused-on-moonshot',
  apiVersion: '2023-06-01',
  maxTokens: 4096,
  maxUses: 5,
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function searchResponse() {
  return {
    search_results: [
      { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', date: '2026-02-02', site_name: 'A Site', content: 'full page' },
      { url: 'https://b.test', title: 'B', snippet: 'excerpt for B' },
    ],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('moonshotSearchLimit', () => {
  it('defaults a missing or non-positive bound', () => {
    expect(moonshotSearchLimit()).toBe(MOONSHOT_DEFAULT_LIMIT)
    expect(moonshotSearchLimit(0)).toBe(MOONSHOT_DEFAULT_LIMIT)
    expect(moonshotSearchLimit(-1)).toBe(MOONSHOT_DEFAULT_LIMIT)
    expect(moonshotSearchLimit(1.5)).toBe(MOONSHOT_DEFAULT_LIMIT)
  })

  it('caps a bound above Moonshot\'s maximum', () => {
    expect(moonshotSearchLimit(8)).toBe(8)
    expect(moonshotSearchLimit(MOONSHOT_MAX_LIMIT + 5)).toBe(MOONSHOT_MAX_LIMIT)
  })
})

describe('moonshotSearchBody', () => {
  it('posts text_query without page crawling', () => {
    expect(moonshotSearchBody('hello', 8)).toEqual({
      text_query: 'hello',
      limit: 8,
      enable_page_crawling: false,
      timeout_seconds: MOONSHOT_TIMEOUT_SECONDS,
    })
  })
})

describe('mapMoonshotHit', () => {
  it('maps snippet and date and drops crawled content', () => {
    expect(mapMoonshotHit({
      url: 'https://a.test',
      title: 'A',
      snippet: 'excerpt',
      date: '2026-02-02',
      content: 'full page',
    })).toEqual({
      url: 'https://a.test',
      title: 'A',
      snippet: 'excerpt',
      publishedAt: '2026-02-02',
    })
  })

  it('drops hits without a url', () => {
    expect(mapMoonshotHit({ title: 'orphan', snippet: 'no url' })).toBeUndefined()
    expect(mapMoonshotHit({ url: '' })).toBeUndefined()
  })
})

describe('mapMoonshotResponse', () => {
  it('maps hits and omits empty optional fields', () => {
    expect(mapMoonshotResponse({
      search_results: [
        { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', date: '2026-02-02' },
        { url: 'https://b.test', title: '', snippet: '', date: '' },
      ],
    })).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', publishedAt: '2026-02-02' },
        { url: 'https://b.test' },
      ],
      truncated: false,
    })
  })

  it('dedupes repeated urls (first wins) and skips empty urls', () => {
    expect(mapMoonshotResponse({
      search_results: [
        { url: 'https://a.test', title: 'first' },
        { url: 'https://a.test', title: 'second' },
        { url: '' },
        { title: 'orphan' },
      ],
    }).sources).toEqual([{ url: 'https://a.test', title: 'first' }])
  })

  it('throws WEB_PROVIDER_ERROR when search_results is absent', () => {
    expect(() => mapMoonshotResponse({}))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('DeepSeekSearchProvider Moonshot request mapping', () => {
  it('posts the dedicated search URL as-is with text_query and does not record a Messages request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    const recordRequest = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchProvider({ ...options, recordRequest }).search({ query: 'hello', maxResults: 8 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.moonshot.cn/v1/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer kimi-key')
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['anthropic-version']).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({
      text_query: 'hello',
      limit: 8,
      enable_page_crawling: false,
      timeout_seconds: MOONSHOT_TIMEOUT_SECONDS,
    })
    expect(recordRequest).not.toHaveBeenCalled()
    expect(result.sources).toEqual([
      { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', publishedAt: '2026-02-02' },
      { url: 'https://b.test', title: 'B', snippet: 'excerpt for B' },
    ])
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await searchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('surfaces HTTP error detail as WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'url.not_found' } }, { status: 404 })))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: 'url.not_found' })
  })

  it('surfaces a malformed success body as WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('surfaces transport failure as WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))
    const error = await searchProvider(options).search({ query: 'q' }).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Moonshot search request failed')
  })

  it('handles a string-form error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'bad request' }, { status: 400 })))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ message: 'bad request' })
  })

  it('handles a top-level message when error has no detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: {}, message: 'from envelope' }, { status: 400 })))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ message: 'from envelope' })
  })

  it('keeps a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream error', { status: 503 })))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ message: 'Moonshot API error (HTTP 503)' })
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('surfaces an abort during success-body parse as WEB_ABORTED', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: true, status: 200 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('surfaces an abort during error-body parse as WEB_ABORTED', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: false, status: 500 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('strict mode flows through search(): a missing search_results array throws WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    await expect(searchProvider(options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })
})
