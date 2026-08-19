# Agent Note: Explicit search-provider tabs on one Web Search card

Status: implemented

English | [中文](2026-08-19-moonshot-search-wire-adaptation.zh.md)

## Problem

Gestalt ships one `web_search` tool over `web-search-deepseek`. Users who need another search wire — Anthropic Messages on a named base, or Moonshot `POST /v1/search` — had to overwrite one `baseURL` and guess the protocol. Guessing mixed Messages search with dedicated retrieval. The model-facing tool stays one `web_search`; the missing piece is an explicit choice of which backend the next search reads.

## Decision

One settings card, **Web Search**, writes `backend` on the DeepSeek section: `deepseek` | `anthropic-messages` | `kimi`. Tabs select the backend immediately. Each tab has its own settings namespace; the leftover DeepSeek `baseURL` is not read when another tab is selected.

The same `deepseek-official` provider still owns `ctx.web` search. Protocol is explicit, not sniffed from the URL:

- **DeepSeek** — Anthropic Messages + `web_search_20250305` at `https://api.deepseek.com/anthropic/v1`.
- **Anthropic** — the same Messages contract at a base the user names; a missing `baseURL` makes the provider unavailable.
- **Kimi** — Moonshot dedicated search: `POST` the configured URL (default `https://api.kimi.com/coding/v1/search`) with `{ "text_query" }` and `Authorization: Bearer`. Key `KIMI_WEB_SEARCH_API_KEY`, then `DEEPSEEK_API_KEY` if that value is header-safe ASCII.

Extra plugins register more tabs into `settings.plugin.web-search.provider`. The Plugins card's **Test search** calls `settings.testWebSearch`, which runs `ctx.web.search({ query: 'deepseek harness' })`.

## Alternatives considered

**Guess the protocol from the configured URL host or path.** Rejected: `api.kimi.com/coding/v1` is Messages and `api.kimi.com/coding/v1/search` is retrieval, so a host allowlist misroutes.

**A second `WebSearchProvider` id plus `searchProvider` selection in `ctx.web`.** Deferred: the shipped composition pins `searchProvider: deepseek-official`, and `WebRuntime` captures that id at construction.

**Two top-level cards plus Use this for web search.** Rejected for the shipped chrome: two cards duplicated the same fields, and a second "use this" control was easy to miss. Tabs on one card write `backend` on click.

**A protocol dropdown without tabs.** Rejected: DeepSeek, Anthropic Messages, and Moonshot retrieval need different endpoint copy; tabs keep that copy next to the fields.

**Leave Moonshot `POST /v1/search` in another package.** Rejected for the Kimi tab: the user-facing provider is already this card, and a second provider id would not change `searchProvider`.

## Consequences

A user who wants official DeepSeek stays on the DeepSeek tab. A user who wants Messages on Kimi coding uses the Anthropic tab and names `https://api.kimi.com/coding/v1`. A user who wants Moonshot retrieval uses the Kimi tab and the dedicated search URL. Non-ASCII stored keys are not sent as HTTP headers.

The unused field panel and `useThis` leftover are tracked in [drop the unused provider panel](../../proposed/simplification/2026-08-19-drop-dead-web-search-provider-panel.md).

## Testing

`packages/web/web-search-deepseek/tests/settings.spec.ts` switches `backend` and asserts Messages hits `{baseURL}/messages` while Kimi hits the search URL with no `/messages` suffix. Client tests cover tab selection and the test-search control. The plugin-config snapshot lists one Web Search card.

## Related

- [Web capability seam](../architecture/2026-06-24-web-capability-seam.md) — providers register capabilities; `dsh-tool-web` owns the stable `web_search` schema.
- [Web plugin configuration](2026-08-10-web-plugin-configuration.md) — settings cards bind one namespace each.
