import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { apply as applyClientRemote, inject as clientRemoteInject } from '../../gateway/src/client/index.ts'
import { remoteErrorOf, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import SettingsController from '../src/index.ts'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'

const contexts: Context[] = []
const require = createRequire(import.meta.url)

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
    if (this.hang !== undefined && request.query === 'hang') {
      if (signal === undefined) throw new Error('fixture hang requires a signal')
      return this.hang(signal)
    }
    if (this.error !== undefined) throw this.error
    return this.result
  }
}

interface SettingsProbeClient {
  testWebSearch(
    query?: string,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly count: number; readonly title?: string; readonly url?: string } }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
  >
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
  const directory = mkdtempSync(join(tmpdir(), 'dsh-settings-typert-'))
  const hostPath = join(directory, 'typert.host.js')
  const remotePath = join(directory, 'typert.remote-client.js')
  writeFileSync(hostPath, rewriteZod(artifact.js))
  writeFileSync(remotePath, rewriteZod(artifact.remote.js))
  const hostModule = await import(pathToFileURL(hostPath).href) as { TYPERT: TypertContribution }
  const remoteModule = await import(pathToFileURL(remotePath).href) as { TYPERT_REMOTE: TypertRemoteContribution }
  return { host: hostModule.TYPERT, remote: remoteModule.TYPERT_REMOTE }
}

async function mountGeneratedSettingsClient(
  host: Context,
  remote: TypertRemoteContribution,
): Promise<SettingsProbeClient> {
  const client = new Context()
  contexts.push(client)
  await client.plugin(TypertRegistry)
  client.provide('connection', {
    rpc: {
      call: async (_channel: string, endpoint: string, payload: { readonly args: Record<string, unknown> }, signal: AbortSignal) => {
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
  await client.remote.$mount(remote)
  return client.remote.settings as SettingsProbeClient
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
    expect(remoteErrorOf(failure)?.code).toBe('gateway/cancelled')
  })

  it('rejects an empty query and serves a generated Gateway request', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.result = { sources: [{ url: 'https://example.test/', title: 'Docs' }], truncated: false }
    const { ctx, controller, provider } = await bootWeb(fixture)
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(TypertGatewayService)
    const generated = await generateSettingsTypert()
    ctx.typert.register(generated.host)
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

  it('serves success, illegal query, and abort through the generated Remote client', async () => {
    const fixture = new RecordingSearchProvider()
    fixture.result = { sources: [{ url: 'https://example.test/', title: 'Docs' }], truncated: false }
    fixture.hang = async (signal) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
      return { sources: [], truncated: false }
    }
    const { ctx, provider } = await bootWeb(fixture)
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(TypertGatewayService)
    const generated = await generateSettingsTypert()
    ctx.typert.register(generated.host)
    const settings = await mountGeneratedSettingsClient(ctx, generated.remote)
    await expect(settings.testWebSearch('generated probe')).resolves.toEqual({
      ok: true,
      value: { count: 1, title: 'Docs', url: 'https://example.test/' },
    })
    await expect(settings.testWebSearch('')).resolves.toMatchObject({
      ok: false,
      error: { code: 'gateway/bad-request' },
    })
    const abort = new AbortController()
    const pending = settings.testWebSearch('hang', abort.signal)
    abort.abort()
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'gateway/cancelled' },
    })
    expect(provider.calls.some(call => call.query === 'generated probe')).toBe(true)
  }, 60_000)

  it('emits the package ./types declaration from this tree\'s sources', () => {
    const root = join(import.meta.dirname, '../../../..')
    const packageRoot = join(root, 'packages/api/settings-controller')
    const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc')
    execFileSync(process.execPath, [
      tsc,
      '-p',
      join(packageRoot, 'tsconfig.json'),
      '--pretty',
      'false',
    ], { cwd: root, stdio: 'pipe' })
    expect(readFileSync(join(packageRoot, 'lib/types/types.d.ts'), 'utf8'))
      .toContain('SettingsWebSearchProbeValue')
  }, 60_000)
})
