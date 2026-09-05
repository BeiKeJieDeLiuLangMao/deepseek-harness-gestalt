import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { apply as applyClientRemote, inject as clientRemoteInject } from '@deepseek-ai/dsh-api-gateway/client'
import SettingsController from '@deepseek-ai/dsh-api-settings-controller'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply as pluginsApply, inject as pluginsInject } from '../src/client/index.ts'
import type { WebSearchShellFace } from '../src/client/web-search-card-controller.ts'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import * as deepseekPlugin from '@deepseek-ai/dsh-web-search-deepseek'

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
})

const MOONSHOT_RESULT = {
  search_results: [{ url: 'https://kimi.test', title: 'Kimi hit', snippet: 'ok' }],
}

const ANTHROPIC_RESULT = {
  content: [
    { type: 'text', text: 'ok' },
    {
      type: 'web_search_tool_result',
      content: [{ type: 'web_search_result', url: 'https://anthropic.test', title: 'Anthropic hit' }],
    },
  ],
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function rewriteZod(source: string): string {
  return source.replaceAll("from 'zod'", `from ${JSON.stringify(import.meta.resolve('zod'))}`)
}

async function generateSettingsTypert(): Promise<{
  readonly host: TypertContribution
  readonly remote: TypertRemoteContribution
}> {
  const { WorkspaceTypertGenerator } = await import('@deepseek-ai/dsh-typert-generator')
  const root = join(import.meta.dirname, '../../../..')
  const [artifact] = new WorkspaceTypertGenerator(root).generate(
    ['@deepseek-ai/dsh-api-settings-controller'],
    ['host'],
  )
  if (artifact === undefined) throw new Error('settings-controller Typert artifact was not generated')
  if (artifact.remote === undefined) throw new Error('settings-controller Remote client artifact was not generated')
  const directory = mkdtempSync(join(tmpdir(), 'dsh-web-search-backend-typert-'))
  const hostPath = join(directory, 'typert.host.js')
  const remotePath = join(directory, 'typert.remote-client.js')
  writeFileSync(hostPath, rewriteZod(artifact.js))
  writeFileSync(remotePath, rewriteZod(artifact.remote.js))
  const hostModule = await import(pathToFileURL(hostPath).href) as { TYPERT: TypertContribution }
  const remoteModule = await import(pathToFileURL(remotePath).href) as { TYPERT_REMOTE: TypertRemoteContribution }
  return { host: hostModule.TYPERT, remote: remoteModule.TYPERT_REMOTE }
}

async function bootLoop(options: {
  persistDelayMs?: number
  writable?: boolean
} = {}): Promise<{
  host: Context
  client: Context
  settings: MemorySettings
  fetchSpy: ReturnType<typeof vi.spyOn>
  face: WebSearchShellFace
}> {
  const host = new Context()
  contexts.push(host)
  await host.plugin(MemorySettings, {
    persistDelayMs: options.persistDelayMs ?? 0,
    writable: options.writable ?? true,
  })
  const settings = host.settings as MemorySettings
  await host.plugin(MemoryCredentials, {
    DEEPSEEK_API_KEY: 'ds-key',
    KIMI_WEB_SEARCH_API_KEY: 'kimi-key',
    ANTHROPIC_SEARCH_KEY: 'anthropic-key',
  })
  await host.plugin(WebRuntime)
  await host.plugin(deepseekPlugin, {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://search.deepseek.test/v1',
  })
  await host.plugin(SettingsController)
  await host.plugin(TypertRegistry)
  await host.plugin(TypertGatewayService)
  const generated = await generateSettingsTypert()
  host.typert.register(generated.host)

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(jsonResponse(
      url.includes('/search') ? MOONSHOT_RESULT : ANTHROPIC_RESULT,
    ))
  })

  const client = new Context()
  contexts.push(client)
  await client.plugin(TypertRegistry)
  await client.plugin(SlotRegistry)
  const locale = new LocaleRuntime(client)
  locale.setLocale('en')
  client.provide('locale', locale)
  client.provide('connection', {
    isLoopback: true,
    generation: { getSnapshot: () => ({ host: { home: undefined } }) },
    rpc: {
      call: async (
        _channel: string,
        endpoint: string,
        payload: { readonly args: Record<string, unknown> },
        signal: AbortSignal,
      ) => {
        const [namespace, method] = endpoint.split('/')
        if (namespace === undefined || method === undefined) {
          throw new Error(`invalid Remote endpoint ${JSON.stringify(endpoint)}`)
        }
        try {
          const value = await host.typertGateway.invoke({
            namespace,
            method,
            args: payload.args,
            signal,
          })
          return { ok: true as const, value }
        } catch (error) {
          const failure = remoteErrorOf(error)
          if (failure === undefined) {
            return {
              ok: false as const,
              error: {
                code: 'gateway/internal',
                message: error instanceof Error ? error.message : String(error),
                details: {},
              },
            }
          }
          return {
            ok: false as const,
            error: { code: failure.code, message: failure.message, details: failure.details },
          }
        }
      },
    },
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  } as never)
  await client.plugin({ inject: clientRemoteInject, apply: applyClientRemote })
  await client.remote.$mount(generated.remote)
  client.provide('remote.session', {
    modelCatalog: () => Promise.resolve({ ok: true as const, value: { groups: [], failures: [] } }),
  } as never)
  await client.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  client.slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  await client.plugin({ inject: [...pluginsInject], apply: pluginsApply }).await()
  await vi.waitFor(() => {
    expect(client.slots.entries('settings.plugin.item').some(entry => entry.options.key === 'web-search-deepseek')).toBe(true)
  })
  const card = client.slots.entries('settings.plugin.item')
    .find(entry => entry.options.key === 'web-search-deepseek')
  if (card === undefined) throw new Error('web-search-deepseek card was not registered')
  const face = (card.inject as unknown as () => WebSearchShellFace)()
  await client.settingsScope.describe().ensure()
  return { host, client, settings, fetchSpy, face }
}

function lastCall(spy: ReturnType<typeof vi.spyOn>): { url: string; init: RequestInit } {
  const [input, init] = spy.mock.calls.at(-1) as [RequestInfo | URL, RequestInit]
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return { url, init }
}

describe('Web Search tab switch through generated settings.testWebSearch', () => {
  it('selects Kimi then probes Moonshot text_query with Bearer-only auth', async () => {
    const { host, client, fetchSpy, face } = await bootLoop({ persistDelayMs: 25 })
    const kimi = client.settingsScope.bind({ namespace: 'web-search-kimi' })
    await kimi.set('baseURL', 'https://api.kimi.com/coding/v1/search')
    const switching = face.selectProvider('kimi')
    const probing = face.testSearch()
    await switching
    await expect(probing).resolves.toMatchObject({ status: 'ok', count: 1, title: 'Kimi hit' })
    expect(host.settings.describe().find(row => String(row.ns) === 'web-search-deepseek')?.value)
      .toMatchObject({ backend: 'kimi' })
    const { url, init } = lastCall(fetchSpy)
    expect(url).toBe('https://api.kimi.com/coding/v1/search')
    expect(JSON.parse(String(init.body))).toEqual({ text_query: 'deepseek harness' })
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer kimi-key')
    expect(headers['x-api-key']).toBeUndefined()
    expect(fetchSpy.mock.calls.every(([input]) => {
      const reached = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return !reached.includes('search.deepseek.test') && !reached.endsWith('/messages')
    })).toBe(true)
  }, 60_000)

  it('does not probe the previous provider when backend write is refused', async () => {
    const { settings, fetchSpy, face } = await bootLoop()
    settings.writableFlag = false
    await face.selectProvider('kimi')
    await expect(face.testSearch()).resolves.toEqual({
      status: 'error',
      message: 'search provider could not be switched',
    })
    expect(face.hooks.webSearchCard.getSnapshot()).toMatchObject({ failed: true, dirty: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 60_000)

  it('keeps Anthropic Messages on its own base and key', async () => {
    const { fetchSpy, face, client } = await bootLoop()
    const anthropic = client.settingsScope.bind({ namespace: 'web-search-anthropic' })
    await anthropic.set('baseURL', 'https://api.anthropic.test/v1')
    await anthropic.set('apiKeyEnv', 'ANTHROPIC_SEARCH_KEY')
    await face.selectProvider('anthropic-messages')
    await expect(face.testSearch()).resolves.toMatchObject({ status: 'ok', count: 1, title: 'Anthropic hit' })
    const { url, init } = lastCall(fetchSpy)
    expect(url).toBe('https://api.anthropic.test/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('anthropic-key')
    expect(headers.authorization).toBe('Bearer anthropic-key')
    expect(fetchSpy.mock.calls.every(([input]) => {
      const reached = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return !reached.includes('search.deepseek.test') && !reached.includes('/v1/search')
    })).toBe(true)
  }, 60_000)
})
