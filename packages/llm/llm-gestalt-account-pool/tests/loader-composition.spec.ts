import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import * as AccountPool from '../src/index.ts'
import { afterEach, describe, expect, it } from 'vitest'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

describe('account-pool Loader composition', () => {
  it('loads keylessly and publishes the authenticated local catalog', async () => {
    const key = 'loader-inference-key-650'
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${key}`)
      expect(request.headers['user-agent']).toMatch(/grok-shell/)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: [{ id: 'loader-model' }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing address')
    const root = await mkdtemp(join(tmpdir(), 'dsh-account-pool-loader-'))
    cleanup.push(async () => { await rm(root, { recursive: true, force: true, maxRetries: 10 }) })
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, `
- name: 'test-llm-service'
- name: '@deepseek-ai/dsh-llm-gestalt-account-pool'
  config:
    baseURL: http://127.0.0.1:${String(address.port)}/v1
    apiKey: ${key}
    refreshIntervalMs: 10
`)
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['test-llm-service', LlmRuntime],
      ['@deepseek-ai/dsh-llm-gestalt-account-pool', AccountPool],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    cleanup.push(async () => { await ctx.fiber.dispose() })
    await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('gestalt-account-pool')
    await expect(ctx.llm.listModels('gestalt-account-pool')).resolves.toEqual([
      { provider: 'gestalt-account-pool', id: 'loader-model', name: 'loader-model' },
    ])
  })

  it('writes the Models-page pi-ai provider with catalog metadata', async () => {
    const key = 'loader-inference-key-650'
    let payload: unknown = {
      data: [{
        id: 'grok-4',
        display_name: 'Grok 4',
        context_window: 256000,
        max_output_tokens: 64000,
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
        default_reasoning_level: 'high',
      }],
    }
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${key}`)
      expect(request.headers['user-agent']).toMatch(/grok-shell/)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(payload))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing address')
    const root = await mkdtemp(join(tmpdir(), 'dsh-account-pool-settings-'))
    cleanup.push(async () => { await rm(root, { recursive: true, force: true, maxRetries: 10 }) })
    const settingsPath = join(root, 'settings.yaml')
    const credentialsPath = join(root, '.credentials.yaml')
    await writeFile(settingsPath, '# personal settings\n')
    await writeFile(credentialsPath, 'version: 1\nrefs: {}\n', { mode: 0o600 })
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, `
- name: 'test-llm-service'
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: ${JSON.stringify(settingsPath)}
    debounceMs: 10
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: ${JSON.stringify(credentialsPath)}
    debounceMs: 10
- name: '@deepseek-ai/dsh-llm-pi-ai'
- name: '@deepseek-ai/dsh-llm-gestalt-account-pool'
  config:
    baseURL: http://127.0.0.1:${String(address.port)}/v1
    apiKey: ${key}
    refreshIntervalMs: 10
`)
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['test-llm-service', LlmRuntime],
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
      ['@deepseek-ai/dsh-llm-pi-ai', LlmPiAi],
      ['@deepseek-ai/dsh-llm-gestalt-account-pool', AccountPool],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    cleanup.push(async () => { await ctx.fiber.dispose() })
    await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('gestalt-account-pool')
    await expect.poll(async () => await readFile(settingsPath, 'utf8')).toMatch(/id: grok-4/)
    const yaml = await readFile(settingsPath, 'utf8')
    expect(yaml).toMatch(/name: Grok 4/)
    expect(yaml).toMatch(/contextWindow: 256000/)
    expect(yaml).toMatch(/maxTokens: 64000/)
    expect(yaml).toMatch(/defaultReasoningLevel: high/)
    expect(yaml).toMatch(/reasoningEfforts:/)
    payload = { data: [] }
    await expect.poll(async () => await readFile(settingsPath, 'utf8')).not.toMatch(/gestalt-account-pool/)
  })

  it('writes the Models-page catalog when the Host inference key is env-shadowed', async () => {
    const key = 'loader-inference-key-650'
    const previous = process.env.DSH_GESTALT_ACCOUNT_POOL_API_KEY
    process.env.DSH_GESTALT_ACCOUNT_POOL_API_KEY = key
    try {
      const server = createServer((_request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          data: [{ id: 'gemini-3-flash', display_name: 'Gemini 3 Flash' }, { id: 'claude-sonnet-4-6' }, { id: 'gpt-5.4' }],
        }))
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      cleanup.push(async () => {
        await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
      })
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('missing address')
      const root = await mkdtemp(join(tmpdir(), 'dsh-account-pool-env-'))
      cleanup.push(async () => { await rm(root, { recursive: true, force: true, maxRetries: 10 }) })
      const settingsPath = join(root, 'settings.yaml')
      const credentialsPath = join(root, '.credentials.yaml')
      await writeFile(settingsPath, '# personal settings\n')
      await writeFile(credentialsPath, 'version: 1\nrefs: {}\n', { mode: 0o600 })
      const configPath = join(root, 'cordis.yml')
      await writeFile(configPath, `
- name: 'test-llm-service'
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: ${JSON.stringify(settingsPath)}
    debounceMs: 10
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: ${JSON.stringify(credentialsPath)}
    debounceMs: 10
- name: '@deepseek-ai/dsh-llm-pi-ai'
- name: '@deepseek-ai/dsh-llm-gestalt-account-pool'
  config:
    baseURL: http://127.0.0.1:${String(address.port)}/v1
    apiKey: ${key}
    refreshIntervalMs: 10
`)
      const ctx = new Context()
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['test-llm-service', LlmRuntime],
        ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
        ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
        ['@deepseek-ai/dsh-llm-pi-ai', LlmPiAi],
        ['@deepseek-ai/dsh-llm-gestalt-account-pool', AccountPool],
      ])
      ctx.loader.internal = {
        version: 'v2',
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      } as unknown as NonNullable<typeof ctx.loader.internal>
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      cleanup.push(async () => { await ctx.fiber.dispose() })
      await expect.poll(async () => await readFile(settingsPath, 'utf8')).toMatch(/id: gemini-3-flash/)
      const yaml = await readFile(settingsPath, 'utf8')
      expect(yaml).toMatch(/id: claude-sonnet-4-6/)
      expect(yaml).toMatch(/id: gpt-5.4/)
      expect(yaml).toMatch(/baseURL: http:\/\/127.0.0.1:/)
    } finally {
      if (previous === undefined) delete process.env.DSH_GESTALT_ACCOUNT_POOL_API_KEY
      else process.env.DSH_GESTALT_ACCOUNT_POOL_API_KEY = previous
    }
  })
})
