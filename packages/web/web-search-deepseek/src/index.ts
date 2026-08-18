/**
 * Register a DeepSeek-backed provider in `ctx.web`. It calls the Anthropic-compatible
 * Messages API with native `web_search_20250305`. The settings page exposes two
 * sections — official DeepSeek and a generic Anthropic-compatible base — and the
 * `backend` field chooses which section the next search reads. The provider reuses
 * `DEEPSEEK_API_KEY` but not `DEEPSEEK_BASE_URL`, because search and chat-completions
 * use different bases.
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

/** Which settings card the next search reads. */
export type WebSearchBackend = 'deepseek' | 'anthropic-messages'

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /**
   * Which settings card the next search reads. `deepseek` uses this section's
   * official DeepSeek endpoint; `anthropic-messages` uses the Anthropic card.
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
  backend: z.union(['deepseek', 'anthropic-messages'] as const).default('deepseek'),
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

export const AnthropicSearchConfig: z<AnthropicSearchConfig> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  model: z.string(),
  apiVersion: z.string(),
  maxTokens: z.number().step(1).min(1),
  maxUses: z.number().step(1).min(1),
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

/** Settings namespace for the Anthropic-protocol search card. */
export const WEB_SEARCH_ANTHROPIC_SETTINGS_NAMESPACE = settingsNamespace('web-search-anthropic')

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(
  ctx: Context,
  deepseek: Config,
  anthropic: AnthropicSearchConfig,
): DeepSeekSearchProviderOptions {
  const section = deepseek.backend === 'anthropic-messages' ? anthropic : deepseek
  const apiKeyEnv = credentialRef(section.apiKeyEnv ?? deepseek.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const literalApiKey = section.apiKey !== undefined && section.apiKey.length > 0
    ? section.apiKey
    : deepseek.apiKey !== undefined && deepseek.apiKey.length > 0
      ? deepseek.apiKey
      : undefined
  const fallbackBaseURL = deepseek.backend === 'anthropic-messages'
    ? undefined
    : launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEEPSEEK_DEFAULT_BASE_URL
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    apiKeyEnv,
    baseURL: section.baseURL ?? fallbackBaseURL ?? '',
    model: section.model ?? deepseek.model ?? DEEPSEEK_DEFAULT_MODEL,
    apiVersion: section.apiVersion ?? deepseek.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION,
    maxTokens: section.maxTokens ?? deepseek.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS,
    maxUses: section.maxUses ?? deepseek.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
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
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(
    () => resolveOptions(ctx, currentDeepseek(), currentAnthropic()),
  ))
}
