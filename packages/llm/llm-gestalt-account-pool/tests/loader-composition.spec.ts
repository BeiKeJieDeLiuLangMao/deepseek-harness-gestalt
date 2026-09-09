import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as AccountPool from '../src/index.ts'
import { afterEach, describe, expect, it } from 'vitest'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(dispose => dispose())) })

describe('account-pool Loader composition', () => {
  it('loads keylessly and publishes the authenticated local catalog', async () => {
    const key = 'loader-inference-key-650'
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${key}`)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: [{ id: 'loader-model' }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => await new Promise<void>(resolve => server.close(() => resolve())))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing address')
    const root = await mkdtemp(join(tmpdir(), 'dsh-account-pool-loader-'))
    cleanup.push(async () => { await rm(root, { recursive: true, force: true }) })
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
})
