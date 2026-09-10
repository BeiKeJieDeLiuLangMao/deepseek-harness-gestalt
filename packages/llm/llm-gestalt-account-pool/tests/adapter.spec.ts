import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, PROVIDER } from '../src/index.ts'

const disposals: Array<() => Promise<void>> = []
afterEach(async () => { await Promise.all(disposals.splice(0).map(dispose => dispose())) })

describe('gestalt account pool dynamic registration', () => {
  it('publishes live models, withdraws an empty catalog, and disposes registration', async () => {
    let models = ['codex-test']
    const key = 'internal-inference-key-650'
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${key}`)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: models.map(id => ({ id })) }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing address')
    disposals.push(async () => {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    })
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    disposals.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin({ apply, inject: ['llm'] }, { baseURL: `http://127.0.0.1:${String(address.port)}/v1`, apiKey: key, refreshIntervalMs: 10 })
    await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain(PROVIDER)
    await expect(ctx.llm.listModels(PROVIDER)).resolves.toEqual([{ provider: PROVIDER, id: 'codex-test', name: 'codex-test' }])
    models = []
    await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).not.toContain(PROVIDER)
  })

  it('aborts and joins an in-flight catalog read before disposal settles', async () => {
    let requestAborted = false
    const server = createServer((request, _response) => {
      request.once('aborted', () => { requestAborted = true })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    disposals.push(async () => {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing address')
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    const fiber = await ctx.plugin({ apply, inject: ['llm'] }, {
      baseURL: `http://127.0.0.1:${String(address.port)}/v1`, apiKey: 'internal-inference-key-650', refreshIntervalMs: 10,
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    await fiber.dispose()
    await expect.poll(() => requestAborted).toBe(true)
    await ctx.fiber.dispose()
  })

  it('fails loud instead of replacing a conflicting provider', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    disposals.push(async () => { await ctx.fiber.dispose() })
    class UserAdapter extends (await import('@deepseek-ai/dsh-llm')).LlmAdapter {
      override providerInfo(): { id: string; name: string } { return { id: PROVIDER, name: 'user route' } }
      async * stream(): AsyncIterable<never> { throw new Error('not exercised') }
    }
    ctx.llm.registerAdapter([PROVIDER], new UserAdapter())
    await expect(ctx.plugin({ apply, inject: ['llm'] }, { baseURL: 'http://127.0.0.1:1/v1', apiKey: 'internal-inference-key-650' }))
      .rejects.toThrow(/already registered/)
  })
})
