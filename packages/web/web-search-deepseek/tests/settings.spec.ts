/** The `web-search-deepseek` settings section layered over the composition entry. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as deepseekPlugin from '@deepseek-ai/dsh-web-search-deepseek'
import {
  WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE,
  WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE,
  WEB_SEARCH_KIMI_SETTINGS_NAMESPACE,
} from '@deepseek-ai/dsh-web-search-deepseek'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** The smallest Anthropic-shaped answer the provider accepts — enough to observe the request. */
const ONE_RESULT = {
  content: [
    { type: 'text', text: 'ok' },
    {
      type: 'web_search_tool_result',
      content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A' }],
    },
  ],
}

async function boot(): Promise<{ ctx: Context; settingsFiber: Fiber; pluginFiber: Fiber }> {
  const ctx = new Context()
  await ctx.plugin(WebRuntime, {})
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const pluginFiber = ctx.plugin(deepseekPlugin, { apiKey: 'ds-key', baseURL: 'https://search.entry.test/v1' })
  await pluginFiber.await()
  return { ctx, settingsFiber, pluginFiber }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Run one search and answer the endpoint it reached. A fresh `Response` per
 * call because a body can only be read once, and the call history is cleared
 * because repeated `spyOn` returns the same spy.
 * @param ctx - context whose `ctx.web` serves the search.
 * @returns the URL the provider fetched.
 */
const MOONSHOT_RESULT = {
  search_results: [{ url: 'https://a.test', title: 'A', snippet: 'ok' }],
}

async function searchOnce(ctx: Context): Promise<string> {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
    .mockImplementation((input) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      return Promise.resolve(jsonResponse(
        url.endsWith('/search') || url.includes('/v1/search') ? MOONSHOT_RESULT : ONE_RESULT,
      ))
    })
  fetchSpy.mockClear()
  await ctx.web.search({ query: 'anything' })
  return String((fetchSpy.mock.calls.at(-1)?.[0] as URL | string | undefined) ?? '')
}

describe('web-search-deepseek settings section', () => {
  it('serves a stored endpoint to the next search without re-registering the provider', async () => {
    const bench = await boot()
    expect(await searchOnce(bench.ctx)).toContain('https://search.entry.test/v1')

    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      baseURL: 'https://search.stored.test/v1',
    })

    expect(await searchOnce(bench.ctx)).toContain('https://search.stored.test/v1')
    await bench.ctx.fiber.dispose()
  })

  it('keeps the literal key out of every described layer', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, { apiKey: 'ds-stored-secret' })

    const [descriptor] = bench.ctx.settings.describe({ redactSecrets: true })
      .filter(row => String(row.ns) === 'web-search-deepseek')

    expect(JSON.stringify(descriptor)).not.toContain('ds-stored-secret')
    expect(descriptor?.secrets).toEqual([{ path: ['apiKey'], set: true }])
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      baseURL: 'https://search.stored.test/v1',
    })
    expect(await searchOnce(bench.ctx)).toContain('https://search.stored.test/v1')

    await bench.settingsFiber.dispose()

    expect(await searchOnce(bench.ctx)).toContain('https://search.entry.test/v1')
    await bench.ctx.fiber.dispose()
  })

  it('releases the namespace when the plugin unloads', async () => {
    const bench = await boot()
    const namespaces = bench.ctx.settings.describe().map(row => String(row.ns))
    expect(namespaces).toContain('web-search-deepseek')
    expect(namespaces).toContain('web-search-anthropic')
    expect(namespaces).toContain('web-search-kimi')

    await bench.pluginFiber.dispose()

    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('web-search-deepseek')
    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('web-search-anthropic')
    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('web-search-kimi')
    await bench.ctx.fiber.dispose()
  })

  it('reads the Anthropic-protocol card when backend selects it', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE, {
      baseURL: 'https://api.kimi.com/coding/v1',
    })
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      backend: 'anthropic-messages',
    })

    expect(await searchOnce(bench.ctx)).toBe('https://api.kimi.com/coding/v1/messages')
    await bench.ctx.fiber.dispose()
  })

  it('is unavailable when the Anthropic card is selected without a base URL', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      backend: 'anthropic-messages',
    })
    await expect(searchOnce(bench.ctx)).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
    await bench.ctx.fiber.dispose()
  })

  it('does not use a leftover DeepSeek endpoint when the Anthropic card is selected', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      backend: 'anthropic-messages',
      baseURL: 'https://search.leftover.test/v1',
    })
    await expect(searchOnce(bench.ctx)).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
    await bench.ctx.fiber.dispose()
  })

  it('uses the Moonshot search default when the Kimi tab is selected without a stored URL', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      backend: 'kimi',
    })
    expect(await searchOnce(bench.ctx)).toBe('https://api.kimi.com/coding/v1/search')
    await bench.ctx.fiber.dispose()
  })

  it('reads a stored Kimi endpoint as the search URL, without appending /messages', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_KIMI_SETTINGS_NAMESPACE, {
      baseURL: 'https://api.kimi.com/coding/v1/search',
    })
    await bench.ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
      backend: 'kimi',
    })
    expect(await searchOnce(bench.ctx)).toBe('https://api.kimi.com/coding/v1/search')
    await bench.ctx.fiber.dispose()
  })

  it('inherits the DeepSeek credential when the Anthropic tab names a different missing ref', async () => {
    const previous = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'inherited-deepseek-key'
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, {})
      const settingsFiber = ctx.plugin(MemorySettings)
      await settingsFiber.await()
      const pluginFiber = ctx.plugin(deepseekPlugin, { baseURL: 'https://search.entry.test/v1' })
      await pluginFiber.await()
      await ctx.settings.update(WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE, {
        baseURL: 'https://api.anthropic.test/v1',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      })
      await ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
        backend: 'anthropic-messages',
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse(ONE_RESULT)))
      await ctx.web.search({ query: 'anything' })
      const init = fetchSpy.mock.calls.at(-1)?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('inherited-deepseek-key')
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previous
    }
  })

  it('falls back to the Kimi credential when Anthropic has neither its own key nor a DeepSeek inherit', async () => {
    const previousDeepseek = process.env.DEEPSEEK_API_KEY
    const previousKimi = process.env.KIMI_WEB_SEARCH_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    process.env.KIMI_WEB_SEARCH_API_KEY = 'kimi-only-key'
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, {})
      const settingsFiber = ctx.plugin(MemorySettings)
      await settingsFiber.await()
      const pluginFiber = ctx.plugin(deepseekPlugin, { baseURL: 'https://search.entry.test/v1' })
      await pluginFiber.await()
      await ctx.settings.update(WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE, {
        baseURL: 'https://api.anthropic.test/v1',
      })
      await ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
        backend: 'anthropic-messages',
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse(ONE_RESULT)))
      await ctx.web.search({ query: 'anything' })
      const init = fetchSpy.mock.calls.at(-1)?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('kimi-only-key')
      await ctx.fiber.dispose()
    } finally {
      if (previousDeepseek === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previousDeepseek
      if (previousKimi === undefined) delete process.env.KIMI_WEB_SEARCH_API_KEY
      else process.env.KIMI_WEB_SEARCH_API_KEY = previousKimi
    }
  })

  it('does not retry the Kimi ref after the Kimi tab already named it', async () => {
    const previousDeepseek = process.env.DEEPSEEK_API_KEY
    const previousKimi = process.env.KIMI_WEB_SEARCH_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.KIMI_WEB_SEARCH_API_KEY
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, {})
      const settingsFiber = ctx.plugin(MemorySettings)
      await settingsFiber.await()
      const pluginFiber = ctx.plugin(deepseekPlugin, { baseURL: 'https://search.entry.test/v1' })
      await pluginFiber.await()
      await ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
        backend: 'kimi',
      })
      await expect(ctx.web.search({ query: 'anything' }))
        .rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
      await ctx.fiber.dispose()
    } finally {
      if (previousDeepseek === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previousDeepseek
      if (previousKimi === undefined) delete process.env.KIMI_WEB_SEARCH_API_KEY
      else process.env.KIMI_WEB_SEARCH_API_KEY = previousKimi
    }
  })

  it('does not invent a Kimi key when Anthropic and DeepSeek refs are both empty', async () => {
    const previousDeepseek = process.env.DEEPSEEK_API_KEY
    const previousKimi = process.env.KIMI_WEB_SEARCH_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.KIMI_WEB_SEARCH_API_KEY
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, {})
      const settingsFiber = ctx.plugin(MemorySettings)
      await settingsFiber.await()
      const pluginFiber = ctx.plugin(deepseekPlugin, { baseURL: 'https://search.entry.test/v1' })
      await pluginFiber.await()
      await ctx.settings.update(WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE, {
        baseURL: 'https://api.anthropic.test/v1',
      })
      await ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, {
        backend: 'anthropic-messages',
      })
      await expect(ctx.web.search({ query: 'anything' }))
        .rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
      await ctx.fiber.dispose()
    } finally {
      if (previousDeepseek === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previousDeepseek
      if (previousKimi === undefined) delete process.env.KIMI_WEB_SEARCH_API_KEY
      else process.env.KIMI_WEB_SEARCH_API_KEY = previousKimi
    }
  })

  it('drops a non-ASCII stored API key instead of sending it as a header', async () => {
    const previous = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, {})
      const settingsFiber = ctx.plugin(MemorySettings)
      await settingsFiber.await()
      const pluginFiber = ctx.plugin(deepseekPlugin, { baseURL: 'https://search.entry.test/v1' })
      await pluginFiber.await()
      await ctx.settings.update(WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, { apiKey: '密钥' })
      await expect(ctx.web.search({ query: 'anything' }))
        .rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previous
    }
  })
})
