/** Dynamic provider backed by the Desktop-owned CLIProxyAPI inference capability. */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmAdapter, LlmError, attributionHeaders, resolveRetryPolicy, userAgent } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { DeepSeekAdapter } from '@deepseek-ai/dsh-llm-deepseek'
import type { DeepSeekCatalogModel, DeepSeekConnectionOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { deepEqualJson, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { parseAccountPoolCatalog, toPiAiModels } from './catalog.ts'
import type { AccountPoolCatalogModel } from './catalog.ts'

export const name = 'llm-gestalt-account-pool'
export const inject = ['llm']
/** Stable product route owned by the built-in account pool. */
export const PROVIDER = 'gestalt-account-pool'
/** Credential reference the Models page resolves for this Host-owned route. */
export const API_KEY_ENV = 'DSH_GESTALT_ACCOUNT_POOL_API_KEY'
const PI_AI_NS = settingsNamespace('llm-pi-ai')

/** Host-injected authority; values stay process-private and out of settings. */
export interface Config {
  /** IPv4-loopback HTTPS CLIProxyAPI `/v1` endpoint owned by this Desktop instance. */
  readonly baseURL: string
  /** Inference-only key generated for this Desktop runtime generation. */
  readonly apiKey: string
  /** Catalog refresh interval in milliseconds; defaults to 2,000. */
  readonly refreshIntervalMs?: number
}

/** Adapter whose registration exists only while the core advertises models. */
export class GestaltAccountPoolAdapter extends LlmAdapter {
  private models: readonly DeepSeekCatalogModel[] = []
  private readonly delegate: DeepSeekAdapter

  /** @param config - One immutable Desktop Host capability generation. */
  constructor(config: Config) {
    super()
    const connection = (): DeepSeekConnectionOptions => ({
      baseURL: trimV1(config.baseURL),
      apiKeyEnv: 'GESTALT_ACCOUNT_POOL_INTERNAL_KEY' as DeepSeekConnectionOptions['apiKeyEnv'],
      defaults: {}, maxTokens: 32_768, defaultContextWindow: 262_144,
      models: this.models, streamIdleTimeoutMs: 300_000,
      maxRequestFilesBytes: 128 * 1024 * 1024, maxInlineRequestImageBytes: 20 * 1024 * 1024,
      maxImagesPerRequest: 600, imageOffloadByteQuantum: 64 * 1024 * 1024,
      inlineImageOffloadByteQuantum: 10 * 1024 * 1024, imageOffloadCountQuantum: 20,
      filesApiTimeoutMs: 30_000,
      filePolicy: { expiresAfterSeconds: 604_800, refreshMarginSeconds: 3_600, quotaCleanupBatch: 100 },
      retryPolicy: resolveRetryPolicy(undefined, 'gestalt account pool retry policy'),
    })
    this.delegate = new DeepSeekAdapter({
      options: connection,
      resolveApiKey: () => Promise.resolve(config.apiKey),
      resolveUserId: () => 'gestalt-account-pool' as never,
    })
  }

  /** @returns stable product provider metadata. */
  override providerInfo(): LlmProviderInfo { return { id: PROVIDER, name: 'Gestalt Account Pool' } }
  /** @returns current live core catalog. */
  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models.map(model => ({
      provider: PROVIDER,
      id: model.id,
      name: model.name ?? model.id,
      ...model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities },
    })))
  }
  /** @returns current exact model metadata. */
  override resolveModel(_provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const hit = this.models.find(entry => entry.id === model)
    return Promise.resolve({
      provider: PROVIDER,
      id: model,
      name: hit?.name ?? model,
      ...hit?.contextWindow === undefined ? {} : { context: { contextWindow: hit.contextWindow } },
      ...hit?.maxTokens === undefined ? {} : { defaultMaxTokens: hit.maxTokens },
      ...hit?.inputModalities === undefined ? {} : { inputModalities: hit.inputModalities },
    })
  }
  /** @returns delegated OpenAI-compatible stream. */
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> { return this.delegate.stream(options) }

  /**
   * Replace the detached model generation after one authenticated catalog read.
   * @param models - Complete current catalog from the owned core.
   */
  setModels(models: readonly DeepSeekCatalogModel[]): void { this.models = models.map(model => ({ ...model })) }
}

/** Register, refresh, withdraw, and dispose the product route. */
export function apply(ctx: Context, config: Config): void {
  const origin = parseLoopbackOrigin(config.baseURL)
  if (typeof config.apiKey !== 'string' || config.apiKey.length < 16) throw new TypeError('gestalt account pool needs its Host inference key')
  const refreshIntervalMs = config.refreshIntervalMs ?? 2_000
  if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0) throw new TypeError('refreshIntervalMs must be positive')
  const adapter = new GestaltAccountPoolAdapter(config)
  let registration: ReturnType<typeof ctx.llm.registerAdapter> | undefined
  let published = false
  let disposed = false
  let timer: NodeJS.Timeout | undefined
  let inFlight: Promise<void> | undefined
  let controller: AbortController | undefined
  const refresh = async (): Promise<void> => {
    /* v8 ignore next -- the disposer clears the only timer before a later tick can re-enter. */
    if (disposed) return
    const request = new AbortController()
    controller = request
    try {
      const catalog = await readAccountPoolCatalog(
        new URL('/v1/models', origin),
        {
          ...attributionHeaders(),
          'user-agent': `${userAgent()} grok-shell/0.2.119`,
          Authorization: `Bearer ${config.apiKey}`,
        },
        request.signal,
      )
      adapter.setModels(catalog.map(toDeepSeekModel))
      if (ctx.get('settings') !== undefined) {
        await publishPiAiProvider(ctx, config, catalog)
        if (published) {
          registration?.()
          registration = undefined
          published = false
        }
        return
      }
      if (!published && catalog.length > 0) {
        if (ctx.llm.listProviders().some(provider => provider.id === PROVIDER)) {
          throw new LlmError(`an adapter for provider "${PROVIDER}" is already registered`, 'DUPLICATE_ADAPTER')
        }
        registration = ctx.llm.registerAdapter([PROVIDER], adapter)
        published = true
      } else if (published && catalog.length === 0) {
        registration?.()
        registration = undefined
        published = false
      } else if (published) {
        registration?.replace([PROVIDER])
      }
    } catch (error) {
      if (request.signal.aborted) return
      if (error instanceof LlmError && error.code === 'DUPLICATE_ADAPTER') {
        disposed = true
        ctx.logger('llm-gestalt-account-pool').error(error)
        return
      }
      if (published) {
        registration?.()
        registration = undefined
        published = false
      }
      ctx.logger('llm-gestalt-account-pool').warn('model catalog unavailable')
      ctx.logger('llm-gestalt-account-pool').warn(error)
    } finally {
      /* v8 ignore next -- sequential refresh owns controller for the whole generation. */
      if (controller === request) controller = undefined
      if (!disposed) timer = setTimeout(() => { inFlight = refresh() }, refreshIntervalMs)
    }
  }
  inFlight = refresh()
  ctx.effect(() => async () => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    controller?.abort()
    await inFlight
    registration?.()
  })
}

async function readAccountPoolCatalog(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<readonly AccountPoolCatalogModel[]> {
  const response = await fetch(url, { headers, signal })
  if (!response.ok) throw new LlmError(`account-pool catalog returned HTTP ${String(response.status)}`, 'PROVIDER_ERROR')
  return parseAccountPoolCatalog(await response.json())
}

function parseLoopbackOrigin(baseURL: string): URL {
  const value = new URL(baseURL)
  if ((value.protocol !== 'http:' && value.protocol !== 'https:') || value.hostname !== '127.0.0.1') {
    throw new TypeError('gestalt account pool baseURL must be IPv4 loopback HTTP or HTTPS')
  }
  return value
}

function trimV1(baseURL: string): string { return baseURL.replace(/\/v1\/?$/u, '') + '/v1' }

function toDeepSeekModel(model: AccountPoolCatalogModel): DeepSeekCatalogModel {
  return {
    id: model.id,
    ...model.name === undefined ? {} : { name: model.name },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
    ...model.input === undefined ? {} : { inputModalities: [...model.input] },
  }
}

async function publishPiAiProvider(
  ctx: Context,
  config: Config,
  catalog: readonly AccountPoolCatalogModel[],
): Promise<boolean> {
  const settings = ctx.get('settings')
  if (settings === undefined) return false
  try {
    if (catalog.length === 0) {
      await settings.mutate(PI_AI_NS, [{ op: 'unset', path: ['providers', PROVIDER] }])
      return true
    }
    const credentials = ctx.get('credentials')
    if (credentials !== undefined && process.env[API_KEY_ENV] !== config.apiKey) {
      try {
        const apiKeyEnv = credentialRef(API_KEY_ENV)
        const info = await credentials.describe(apiKeyEnv)
        if (info.writable) {
          const current = await credentials.resolve(apiKeyEnv)
          if (current?.value !== config.apiKey) await credentials.set(apiKeyEnv, config.apiKey)
        }
      } catch (error) {
        ctx.logger('llm-gestalt-account-pool').warn('Host inference key was not stored; Models page still uses the process environment')
        ctx.logger('llm-gestalt-account-pool').warn(error)
      }
    }
    const profile = {
      displayName: 'Gestalt Account Pool',
      api: 'openai-completions',
      baseURL: trimV1(config.baseURL),
      apiKeyEnv: API_KEY_ENV,
      models: toPiAiModels(catalog),
    }
    const section = settings.get(PI_AI_NS) as { providers?: Record<string, unknown> } | undefined
    const existing = asRecord(section?.providers?.[PROVIDER])
    if (existing?.displayName === profile.displayName
      && existing.api === profile.api
      && existing.baseURL === profile.baseURL
      && existing.apiKeyEnv === profile.apiKeyEnv
      && deepEqualJson(comparableModels(existing.models), comparableModels(profile.models))) return true
    await settings.update(PI_AI_NS, { providers: { [PROVIDER]: profile } })
    return true
  } catch (error) {
    ctx.logger('llm-gestalt-account-pool').warn('Models page provider was not updated')
    ctx.logger('llm-gestalt-account-pool').warn(error)
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function comparableModels(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    const model = asRecord(entry)
    if (model === undefined) return entry
    const input = model.input
    return {
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      ...Array.isArray(input) && input.length > 0 ? { input } : {},
      reasoningEfforts: model.reasoningEfforts,
      defaultReasoningLevel: model.defaultReasoningLevel,
    }
  })
}
