import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { RemoteError, remoteErrorOf, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import SettingsController from '../src/index.ts'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
})

class RecordingSearchProvider implements WebSearchProvider {
  readonly id = 'probe-fixture'
  readonly calls: Array<{ query: string; signal?: AbortSignal }> = []
  result: WebSearchResult = { sources: [], truncated: false }
  error: Error | undefined
  hang: ((signal: AbortSignal) => Promise<WebSearchResult>) | undefined

  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    this.calls.push({ query: request.query, ...signal === undefined ? {} : { signal } })
    if (this.hang !== undefined) {
      if (signal === undefined) throw new Error('fixture hang requires a signal')
      return this.hang(signal)
    }
    if (this.error !== undefined) throw this.error
    return this.result
  }
}

async function bootWeb(provider: RecordingSearchProvider): Promise<{
  ctx: Context
  controller: SettingsController
  provider: RecordingSearchProvider
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MemorySettings)
  await ctx.plugin(WebRuntime)
  ctx.web.registerSearchProvider(provider)
  await ctx.plugin(SettingsController)
  return { ctx, controller: ctx.settingsController, provider }
}

async function loadGeneratedSettingsTypert(): Promise<TypertContribution> {
  try {
    const { WorkspaceTypertGenerator } = await import('@deepseek-ai/dsh-typert-generator')
    const root = join(import.meta.dirname, '../../../..')
    const [artifact] = new WorkspaceTypertGenerator(root).generate(
      ['@deepseek-ai/dsh-api-settings-controller'],
      ['host'],
    )
    if (artifact === undefined) throw new Error('settings-controller Typert artifact was not generated')
    const modulePath = join(mkdtempSync(join(tmpdir(), 'dsh-settings-typert-')), 'typert.host.js')
    writeFileSync(modulePath, artifact.js)
    const generated = await import(pathToFileURL(modulePath).href) as { TYPERT: TypertContribution }
    return generated.TYPERT
  } catch (error) {
    const modulePath = join(import.meta.dirname, '../lib/typert.host.js')
    if (!existsSync(modulePath)) throw error
    const generated = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`) as {
      TYPERT: TypertContribution
    }
    return generated.TYPERT
  }
}

describe('settings.testWebSearch probe', () => {
  it('publishes testWebSearch on the settings namespace', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(SettingsController)
    expect(remoteMethods(ctx.settingsController)).toContainEqual({
      method: 'testWebSearch',
      invocation: { kind: 'direct' },
    })
  })

  it('fails closed when the web capability is absent', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(SettingsController)
    const failure = await ctx.settingsController.testWebSearch(undefined, new AbortController().signal)
      .then(() => undefined, (error: unknown) => error)
    expect(remoteErrorOf(failure)).toMatchObject({
      code: 'gateway/internal',
      message: 'web capability is absent: this deployment does not mount @deepseek-ai/dsh-web',
      details: {},
    })
  })

  it('searches without a Session and returns the first source facts', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.result = {
      sources: [
        { url: 'https://example.test/harness', title: 'Harness docs' },
        { url: 'https://example.test/other' },
      ],
      truncated: false,
    }
    const { controller, provider } = await bootWeb(fixture)
    const signal = new AbortController().signal
    await expect(controller.testWebSearch('probe query', signal)).resolves.toEqual({
      count: 2,
      title: 'Harness docs',
      url: 'https://example.test/harness',
    })
    expect(provider.calls).toEqual([{ query: 'probe query', signal }])
  })

  it('uses the default query when the caller omits one', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.result = { sources: [{ url: 'https://example.test/' }], truncated: false }
    const { controller, provider } = await bootWeb(fixture)
    await expect(controller.testWebSearch(undefined, new AbortController().signal)).resolves.toEqual({
      count: 1,
      url: 'https://example.test/',
    })
    expect(provider.calls[0]?.query).toBe('deepseek harness')
  })

  it('reports a provider throw as gateway/internal', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.error = new Error('search backend refused')
    const { controller } = await bootWeb(fixture)
    const failure = await controller.testWebSearch('probe', new AbortController().signal)
      .then(() => undefined, (error: unknown) => error)
    expect(remoteErrorOf(failure)).toMatchObject({
      code: 'gateway/internal',
      message: 'search backend refused',
      details: {},
    })
  })

  it('forwards abort to the search provider', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.hang = async (signal) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
      return { sources: [], truncated: false }
    }
    const { controller } = await bootWeb(fixture)
    const abort = new AbortController()
    const pending = controller.testWebSearch('hang', abort.signal)
    abort.abort()
    const failure = await pending.then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(RemoteError)
    expect(remoteErrorOf(failure)?.code).toBe('gateway/cancelled')
  })

  it('rejects an empty query and serves a generated Gateway request', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.result = { sources: [{ url: 'https://example.test/', title: 'Docs' }], truncated: false }
    const { ctx, controller, provider } = await bootWeb(fixture)
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(TypertGatewayService)
    const contribution = await loadGeneratedSettingsTypert()
    ctx.typert.register(contribution)
    const descriptor = ctx.typert.local.get('settings/testWebSearch')
    expect(descriptor).toBeDefined()
    expect(descriptor?.parameters.some(parameter => parameter.codec.mode === 'src-json')).toBe(false)
    await expect(ctx.typertGateway.invoke({
      namespace: 'settings',
      method: 'testWebSearch',
      args: { query: '' },
    })).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(ctx.typertGateway.invoke({
      namespace: 'settings',
      method: 'testWebSearch',
      args: { query: 'generated probe' },
    })).resolves.toEqual({
      count: 1,
      title: 'Docs',
      url: 'https://example.test/',
    })
    expect(provider.calls.at(-1)?.query).toBe('generated probe')
    expect(controller.typertRemote.namespace).toBe('settings')
  }, 60_000)
})
