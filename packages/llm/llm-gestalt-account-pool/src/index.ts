/** Dynamic provider backed by the Desktop-owned CLIProxyAPI inference capability. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError, attributionHeaders, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { DeepSeekAdapter } from '@deepseek-ai/dsh-llm-deepseek'
import type { DeepSeekCatalogModel, DeepSeekConnectionOptions } from '@deepseek-ai/dsh-llm-deepseek'

export const name = 'llm-gestalt-account-pool'
export const inject = ['llm']
/** Stable product route owned by the built-in account pool. */
export const PROVIDER = 'gestalt-account-pool'

/** Host-injected authority; values stay process-private and out of settings. */
export interface Config {
  /** IPv4-loopback CLIProxyAPI `/v1` endpoint owned by this Desktop instance. */
  readonly baseURL: string
  /** Inference-only key generated for this Desktop runtime generation. */
  readonly apiKey: string
  /** Catalog refresh interval in milliseconds; defaults to 2,000. */
  readonly refreshIntervalMs?: number
}

interface ModelsResponse { readonly data: readonly { readonly id: string }[] }

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
    return Promise.resolve(this.models.map(model => ({ provider: PROVIDER, id: model.id, name: model.name ?? model.id })))
  }
  /** @returns current exact model metadata. */
  override resolveModel(_provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const hit = this.models.find(entry => entry.id === model)
    return Promise.resolve({ provider: PROVIDER, id: model, name: hit?.name ?? model })
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
  if (ctx.llm.listProviders().some(provider => provider.id === PROVIDER)) {
    throw new LlmError(`an adapter for provider "${PROVIDER}" is already registered`, 'DUPLICATE_ADAPTER')
  }
  let published = false
  let disposed = false
  let timer: NodeJS.Timeout | undefined
  let inFlight: Promise<void> | undefined
  let controller: AbortController | undefined
  const refresh = async (): Promise<void> => {
    if (disposed) return
    const request = new AbortController()
    controller = request
    try {
      const response = await fetch(new URL('/v1/models', origin), {
        headers: { ...attributionHeaders(), Authorization: `Bearer ${config.apiKey}` },
        signal: request.signal,
      })
      if (!response.ok) throw new LlmError(`account-pool catalog returned HTTP ${String(response.status)}`, 'PROVIDER_ERROR')
      const body = parseModels(await response.json())
      adapter.setModels(body.data.map(({ id }) => ({ id, name: id })))
      if (!published && body.data.length > 0) {
        registration = ctx.llm.registerAdapter([PROVIDER], adapter)
        published = true
      } else if (published && body.data.length === 0) {
        registration?.()
        registration = undefined
        published = false
      } else if (published) {
        registration?.replace([PROVIDER])
      }
    } catch (error) {
      if (disposed || request.signal.aborted) return
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

function parseLoopbackOrigin(baseURL: string): URL {
  const value = new URL(baseURL)
  if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1') throw new TypeError('gestalt account pool baseURL must be IPv4 loopback HTTP')
  return value
}

function trimV1(baseURL: string): string { return baseURL.replace(/\/v1\/?$/u, '') + '/v1' }

function parseModels(value: unknown): ModelsResponse {
  if (value === null || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) throw new Error('account-pool catalog JSON is invalid')
  const data = value.data.flatMap(entry => entry !== null && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string' && entry.id.length > 0 ? [{ id: entry.id }] : [])
  return { data }
}
