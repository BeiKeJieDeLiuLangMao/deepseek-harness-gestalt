/**
 * Register a DeepSeek-backed provider in `ctx.web`. It calls the Anthropic-compatible
 * Messages API with native `web_search_20250305`. The settings page exposes one
 * Web Search card whose provider tab writes `backend`; each tab has its own
 * settings section. The provider reuses `DEEPSEEK_API_KEY` but not
 * `DEEPSEEK_BASE_URL`, because search and chat-completions use different bases.
 * @module @deepseek-ai/dsh-web-search-deepseek
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
  DEEPSEEK_DEFAULT_MODEL,
} from './provider.ts'
import type { DeepSeekSearchProviderOptions } from './provider.ts'

export {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_PROVIDER_ID,
} from './provider.ts'
export type { DeepSeekSearchLlmRequest, DeepSeekSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-deepseek'

/** The web seam this provider registers into. */
export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** Which provider tab the next search reads. */
export type WebSearchBackend = 'deepseek' | 'anthropic-messages' | 'kimi'

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /**
   * Which provider tab the next search reads. `deepseek` uses this section's
   * official DeepSeek endpoint; `anthropic-messages` uses the Anthropic tab;
   * `kimi` uses Moonshot `POST /v1/search`.
   */
  backend?: WebSearchBackend
  /** Literal DeepSeek API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each search; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv?: string
  /** Anthropic-compatible endpoint base; `/messages` is appended. */
  baseURL?: string
  /** Anthropic-format model name. Defaults to `deepseek-v4-flash`. */
  model?: string
  /** `anthropic-version` header value. Defaults to `2023-06-01`. */
  apiVersion?: string
  /** Upper bound on generated tokens for the Messages request. Defaults to 4096. */
  maxTokens?: number
  /** Maximum `web_search` server-tool uses per request. Defaults to 5. */
  maxUses?: number
}

export const Config: z<Config> = z.object({
  backend: z.union(['deepseek', 'anthropic-messages', 'kimi'] as const).default('deepseek'),
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  // Declared here rather than only at the use site: a configuration surface
  // renders the resolved section, so a default the schema does not carry reads
  // there as no value at all.
  baseURL: z.string(),
  model: z.string().default(DEEPSEEK_DEFAULT_MODEL),
  apiVersion: z.string().default(DEEPSEEK_DEFAULT_API_VERSION),
  maxTokens: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_TOKENS),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

/** Anthropic-protocol card: a Messages base the user names explicitly. */
export interface AnthropicSearchConfig {
  /** Literal API key; prefer {@link apiKeyEnv}. */
  apiKey?: string
  /** Credential reference resolved for each Anthropic-protocol search. */
  apiKeyEnv?: string
  /** Anthropic-compatible endpoint base; `/messages` is appended. */
  baseURL?: string
  /** Anthropic-format model name. */
  model?: string
  /** `anthropic-version` header value. */
  apiVersion?: string
  /** Upper bound on generated tokens for the Messages request. */
  maxTokens?: number
  /** Maximum `web_search` server-tool uses per request. */
  maxUses?: number
}

/** Settings schema for the Anthropic-protocol search card. */
export const AnthropicSearchConfig: z<AnthropicSearchConfig> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  model: z.string(),
  apiVersion: z.string(),
  maxTokens: z.number().step(1).min(1),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

/**
 * Environment variable naming this provider's endpoint. Deliberately distinct
 * from `$DEEPSEEK_BASE_URL`, which belongs to the chat-completions adapter:
 * search speaks the Anthropic-compatible Messages API, so one variable cannot
 * serve both.
 */
const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL'

/** Settings namespace for the official DeepSeek search card. */
export const WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = settingsNamespace('web-search-deepseek')

/** Settings namespace for the Anthropic-protocol search tab. */
export const WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE = settingsNamespace('web-search-anthropic')

/** Settings namespace for the Kimi / Moonshot search tab. */
export const WEB_SEARCH_KIMI_SETTINGS_NAMESPACE = settingsNamespace('web-search-kimi')

/** Moonshot dedicated search endpoint. The URL is POSTed as-is. */
export const KIMI_DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1/search'

/** Credential reference Moonshot search reads first. */
const KIMI_API_KEY_ENV = 'KIMI_WEB_SEARCH_API_KEY'

/** Environment variable naming the Moonshot search endpoint. */
const KIMI_BASE_URL_ENV = 'KIMI_WEB_SEARCH_BASE_URL'

/** Kimi tab: dedicated Moonshot search, not Anthropic Messages. */
export interface KimiSearchConfig {
  /** Literal API key; prefer {@link apiKeyEnv}. */
  apiKey?: string
  /** Credential reference resolved for each Kimi search. */
  apiKeyEnv?: string
  /** Full Moonshot search URL. */
  baseURL?: string
  /** Upper bound on returned sources after the provider maps `search_results`. */
  maxUses?: number
}

/** Settings schema for the Kimi / Moonshot search tab. */
export const KimiSearchConfig: z<KimiSearchConfig> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(KIMI_API_KEY_ENV),
  baseURL: z.string().default(KIMI_DEFAULT_BASE_URL),
  maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES),
})

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param deepseek - the official DeepSeek tab, including the `backend` selector.
 * @param anthropic - the Anthropic-protocol tab.
 * @param kimi - the Kimi / Moonshot search tab.
 * @returns options for one search.
 */
function resolveOptions(
  ctx: Context,
  deepseek: Config,
  anthropic: AnthropicSearchConfig,
  kimi: KimiSearchConfig,
): DeepSeekSearchProviderOptions {
  const backend = deepseek.backend
  const section = backend === 'anthropic-messages'
    ? anthropic
    : backend === 'kimi'
      ? kimi
      : deepseek
  const apiKeyEnv = credentialRef(
    section.apiKeyEnv
    ?? (backend === 'kimi' ? KIMI_API_KEY_ENV : undefined)
    ?? deepseek.apiKeyEnv
    ?? DEFAULT_API_KEY_ENV,
  )
  const fallbackEnv = credentialRef(deepseek.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const literalApiKey = asciiSecret(section.apiKey) ?? asciiSecret(deepseek.apiKey)
  const fallbackBaseURL = backend === 'anthropic-messages'
    ? undefined
    : backend === 'kimi'
      ? launchEnvironmentOf(ctx).get(KIMI_BASE_URL_ENV)?.value ?? KIMI_DEFAULT_BASE_URL
      : launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEEPSEEK_DEFAULT_BASE_URL
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      const read = async (ref: ReturnType<typeof credentialRef>): Promise<string | undefined> => {
        if (credentials !== undefined) return (await credentials.resolve(ref))?.value
        const ambient = launchEnvironmentOf(ctx).get(ref)
        return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
      }
      const tried = [apiKeyEnv]
      const primary = asciiSecret(await read(apiKeyEnv))
      if (primary !== undefined) return primary
      if (apiKeyEnv !== fallbackEnv) {
        tried.push(fallbackEnv)
        const inherited = asciiSecret(await read(fallbackEnv))
        if (inherited !== undefined) return inherited
      }
      if (backend === 'anthropic-messages' || backend === 'kimi') {
        const kimiRef = credentialRef(KIMI_API_KEY_ENV)
        if (!tried.some(ref => ref === kimiRef)) {
          const kimi = asciiSecret(await read(kimiRef))
          if (kimi !== undefined) return kimi
        }
      }
      return undefined
    },
    apiKeyEnv,
    baseURL: section.baseURL ?? fallbackBaseURL ?? '',
    model: backend === 'kimi'
      ? (deepseek.model ?? DEEPSEEK_DEFAULT_MODEL)
      : (section.model ?? deepseek.model ?? DEEPSEEK_DEFAULT_MODEL),
    apiVersion: backend === 'kimi'
      ? (deepseek.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION)
      : (section.apiVersion ?? deepseek.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION),
    maxTokens: backend === 'kimi'
      ? (deepseek.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS)
      : (section.maxTokens ?? deepseek.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS),
    maxUses: section.maxUses ?? deepseek.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
    ...backend === 'kimi' ? { protocol: 'moonshot-search' as const } : {},
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append(
        'web/deepseek-search-llm-request',
        request,
      )
    },
  }
}

/** Register the DeepSeek search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  let currentDeepseek: () => Config = () => config
  let currentAnthropic: () => AnthropicSearchConfig = () => ({})
  let currentKimi: () => KimiSearchConfig = () => ({})
  installSettingsSection(ctx, WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      currentDeepseek = source
    },
    onChange: () => {},
  })
  installSettingsSection(ctx, WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE, AnthropicSearchConfig, {}, {
    setSource: (source) => {
      currentAnthropic = source
    },
    onChange: () => {},
  })
  installSettingsSection(ctx, WEB_SEARCH_KIMI_SETTINGS_NAMESPACE, KimiSearchConfig, {}, {
    setSource: (source) => {
      currentKimi = source
    },
    onChange: () => {},
  })
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(
    () => resolveOptions(ctx, currentDeepseek(), currentAnthropic(), currentKimi()),
  ))
}

/** A header-safe secret: fetch rejects non-Latin-1 values as a ByteString error. */
// TODO(double-ascii): fold with asciiHeaders in provider.ts once the probe path is stable.
function asciiSecret(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) return undefined
  }
  return value
}
