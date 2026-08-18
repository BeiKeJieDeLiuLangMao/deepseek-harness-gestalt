# @deepseek-ai/dsh-web-search-deepseek

English | [中文](README.zh.md)

A [DeepSeek](https://deepseek.com)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). The default endpoint calls DeepSeek's **Anthropic-compatible Messages API** (`POST {baseURL}/messages`) with the native `web_search_20250305` server tool enabled, and maps the structured `web_search_tool_result` blocks DeepSeek returns into the seam's normalized `WebSearchResult`. A configured Moonshot/Kimi dedicated search URL is posted as-is with `text_query` and mapped from `search_results[]` instead.

This is an **implementation** package: it registers a provider into `ctx.web`, resolves its credential for each search through the optional `ctx.credentials` seam, records the auxiliary request in the initiating Agent session when one exists, and does not register a model-facing tool. Like `@deepseek-ai/dsh-llm-deepseek`, it is a function/namespace plugin (`inject: ['web']`). The Anthropic wire shape is a provider-private detail — it does **not** make this provider depend on `ctx.llm`.

## How it differs from a dedicated search endpoint

Exa and Perplexity expose dedicated search endpoints; DeepSeek's official search does not. On a DeepSeek Anthropic base this provider issues a **full Messages model call** carrying the `web_search` server tool, so one search costs a complete model turn in latency and tokens — heavier than a pure retrieval endpoint. DeepSeek runs the search server-side and returns **structured** `web_search_tool_result` blocks; the provider parses those blocks and **never scrapes URLs out of model prose**.

When the same settings card names a Moonshot/Kimi dedicated search URL (`api.moonshot.cn`, `api.moonshot.ai`, `api.kimi.com`, `api.kimi.ai`, or any path ending in `/search`), the provider instead `POST`s that URL as-is with `{text_query, limit, enable_page_crawling: false, timeout_seconds: 30}` — Kimi CLI's `moonshot_search` retrieval contract. A path that still contains `/anthropic` stays on DeepSeek Messages even on a Moonshot host.

**Strict mode**: if a DeepSeek response carries no `web_search_tool_result` block, or a Moonshot response carries no `search_results` array, the provider throws `WebError` `WEB_PROVIDER_ERROR` rather than degrading to prose-scraping.

It reuses the `DEEPSEEK_API_KEY` credential reference (no new secret) but **not** `$DEEPSEEK_BASE_URL`: the search endpoint is the Anthropic-compatible base (`https://api.deepseek.com/anthropic/v1`), distinct from the chat-completions base (`https://api.deepseek.com`) the LLM adapter uses. A mounted credentials service is authoritative; without one, the provider falls back to the launching process environment. The reference is resolved for each search, so a key stored or rotated by the Web Models page reaches the next call without a restart.

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | omitted | Literal DeepSeek API key. Prefer `apiKeyEnv` so no secret enters configuration; a non-empty literal wins. |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference resolved for each search through `ctx.credentials`, or from the process environment when that seam is absent. A missing value fails the call as `WEB_PROVIDER_CREDENTIAL_MISSING`. |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Search endpoint. A DeepSeek Anthropic base appends `/messages`. A Moonshot/Kimi dedicated search URL is posted as-is (set the full URL, for example `https://api.moonshot.cn/v1/search`). Falls back to `$DEEPSEEK_SEARCH_BASE_URL` from any environment layer; do not reuse `$DEEPSEEK_BASE_URL`, which belongs to the chat-completions LLM adapter. An unparseable value makes the provider unavailable. |
| `model` | `deepseek-v4-flash` | Anthropic-format model name. |
| `apiVersion` | `2023-06-01` | `anthropic-version` header value. |
| `maxTokens` | `4096` | Positive-integer upper bound on generated tokens for the Messages request. |
| `maxUses` | `5` | Positive-integer maximum `web_search` server-tool uses per request. |

```yaml
- id: web-search-deepseek
  name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

The entry above is the base layer of the `web-search-deepseek` Settings section: a user layer over it reaches the NEXT search, because the provider projects the section per call rather than capturing it at registration. The seam's provider selection therefore never flickers when an endpoint or model changes. `apiKey` carries `role('secret')`, so it never rides a `describe()` response in any layer — a configuration surface learns only whether the credentials domain holds a value for the reference `apiKeyEnv` names, never whether a layer carries a literal key.

## Mapping

Neither wire format contributes provider-generated answer text this provider trusts as `content`, so `content` is omitted. On DeepSeek, `sources[]` comes from `web_search_result` items inside `web_search_tool_result` blocks: `url` ← `url`, `title` ← `title`, and `publishedAt` ← `page_age`. Snippets live separately as URL-keyed `cited_text` entries in a text block's `citations[]`; the provider joins them, leaving `snippet` absent when no excerpt exists. On Moonshot, `sources[]` comes from `search_results[]`: `url` ← `url`, `title` ← `title`, `snippet` ← `snippet`, and `publishedAt` ← `date`. Crawled `content` is dropped.

Results are deduplicated by URL because one request may surface the same page across searches. DeepSeek exposes `maxUses`, not a result-count knob, so the seam enforces `maxResults` by truncating `sources[]` and setting `truncated`. Moonshot accepts `limit` (1–20, default 5) from `maxResults`; the seam still truncates if the provider returns more.

Provider failures become `WEB_PROVIDER_ERROR`; caller cancellation becomes `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`.

## Request logging

Immediately before a DeepSeek Messages dispatch, a search running under an initiating Agent appends the log-only `web/deepseek-search-llm-request` session event. It contains the resolved endpoint, API version, and exact secret-free JSON body sent to DeepSeek; headers and credentials are excluded. Credential failures and cancellations before dispatch create no event, while later HTTP or response failures leave the attempted request durable. A Moonshot dedicated-search call is retrieval, not an auxiliary model turn, so it writes no session event. Direct programmatic provider calls outside an Agent have no initiating session to log.

## Model Experience

### Auxiliary DeepSeek search request

#### What the model sees

A separate DeepSeek model receives exactly `Perform a web search for the query: <query>` as its user text and one native `web_search` server-tool definition. This request is not part of the conversation model's context.

#### Token effect

Separate provider input and output tokens are incurred for each search; `maxTokens` caps generated output and `maxUses` caps native search uses.

#### KV Cache effect

Independent of the conversation request cache. The auxiliary instruction and native tool definition can form a stable prefix, but each changed query or model route prevents reuse from its first difference.

### Conversation tool result, indirectly

#### What the model sees

Through [`dsh-tool-web`](../tool-web/README.md), the conversation model sees deduplicated URLs, titles, dates, and citation snippets from structured search blocks; provider prose is not trusted as an answer. This provider's exact failures include the actionable missing-credential message, `DeepSeek search credential resolution failed: <error>`, `DeepSeek search aborted`, `DeepSeek search request failed: <error>`, `DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search`, `DeepSeek returned an unprocessable response body: <error>`, `Moonshot search request failed: <error>`, `Moonshot returned no search_results; the dedicated search endpoint produced no result list`, and `Moonshot returned an unprocessable response body: <error>`; HTTP failures preserve the provider message. The consumer owns the error wrapper.

#### Token effect

Zero direct conversation tokens from registration. Result tokens scale with returned sources and snippets, then the seam enforces the requested source bound.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **One DeepSeek search costs a full Messages model turn** — latency plus generated tokens, with up to `maxUses` server-side searches; DeepSeek exposes no dedicated retrieval endpoint. Moonshot dedicated search is retrieval and does not incur that auxiliary turn.
- **Dynamic credential availability resolves inside the operation** — the synchronous `available()` contract can establish that a resolver exists but cannot query an asynchronous credential store. A selected keyless provider therefore fails the search with `WEB_PROVIDER_CREDENTIAL_MISSING`; the stable `web_search` schema remains registered. Caller cancellation races this preflight locally, but cannot force an arbitrary credential backend itself to stop work.
- **Over-returned DeepSeek sources still cost tokens** — with no result-count knob on the DeepSeek wire, `maxResults` is enforced only post-hoc by seam truncation. Moonshot receives `limit` up to 20.
- **Uncited DeepSeek results carry no `snippet`** — a DeepSeek source gains one only when a `text` block citation (`cited_text`) matches its URL. Moonshot sources use the dedicated `snippet` field.
- **Moonshot `moonshot_fetch` is out of scope** — Gestalt ships `web_fetch` disabled; this package adapts search only.
