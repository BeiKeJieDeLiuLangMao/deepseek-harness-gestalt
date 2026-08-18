# Agent Note: Moonshot dedicated-search wire adaptation on the shipped search provider

Status: implemented

English | [中文](2026-08-19-moonshot-search-wire-adaptation.zh.md)

## Problem

Gestalt pins `searchProvider: deepseek-official` and exposes one web-search settings card over the `web-search-deepseek` namespace. Users who already hold a Kimi key point that card's `baseURL` at Moonshot's dedicated search URL (`https://api.moonshot.cn/v1/search`). The shipped provider always appended `/messages` and posted an Anthropic Messages body with `web_search_20250305`, so the request landed on `…/v1/search/messages` and Moonshot returned `url.not_found`. The model-facing `web_search` tool stayed registered; only the vendor wire format was wrong. DeepSeek official search must keep working when the same card still names an Anthropic base.

## Decision

`@deepseek-ai/dsh-web-search-deepseek` classifies the configured `baseURL` and speaks two wire formats under the same provider id:

- A path containing `/anthropic` or `/coding`, or any URL that is not a Moonshot dedicated-search endpoint, keeps DeepSeek Messages (`POST {baseURL}/messages` with `web_search_20250305`). Kimi's coding API (`https://api.kimi.com/coding/v1`) uses this path.
- A known Moonshot search host (`api.moonshot.cn`, `api.moonshot.ai`) or a path ending in `/search` posts the configured URL as-is with Kimi CLI's `moonshot_search` body `{text_query, limit, enable_page_crawling: false, timeout_seconds: 30}` and maps `search_results[]` into the seam's `WebSearchResult`.

The settings card, credential reference (`DEEPSEEK_API_KEY`), and `searchProvider: deepseek-official` pin do not change. Moonshot retrieval writes no `web/deepseek-search-llm-request` event because it is not an auxiliary model turn. Both formats reject HTTP redirects before following `Location`. `moonshot_fetch` stays out of scope: Gestalt ships `web_fetch` disabled.

## Alternatives considered

**A second `web-search-moonshot` provider package selected by `searchProvider`.** Rejected for this change: the shipped composition pins `deepseek-official`, and the settings card is hardcoded to `web-search-deepseek`. A second registered provider would never run until both the pin and the card changed, which does not repair the URL users already saved.

**Domain-aware selection inside `ctx.web`.** Rejected: the seam selects by explicit provider id or by "exactly one usable provider". Teaching it vendor URL families would couple the Service Definition to Moonshot and DeepSeek hosts, and would still require a second provider plus a settings-card rewrite.

**Fail loudly when `baseURL` is a Moonshot host.** Rejected: the user already stored that URL on the shipped card and asked the current tool to speak both services. A clearer error would still leave search unusable.

## Consequences

The shipped search card can name either a DeepSeek Anthropic base or a Moonshot dedicated search URL without swapping provider id. Custom proxies keep working when they preserve `/anthropic` or end in `/search`. A Moonshot host that later exposes an Anthropic Messages search path stays on DeepSeek Messages if that path contains `/anthropic`. Adding a true second selected provider remains possible later; this adaptation does not invent a second model-facing tool.

## Testing

`packages/web/web-search-deepseek/tests/endpoint.spec.ts` pins host, path, `/anthropic` and `/coding` overrides, and unparseable fallback. `tests/moonshot.spec.ts` pins request mapping (URL as-is, `text_query`, no Messages log, no Anthropic headers), response mapping, `limit` clamping, and the Moonshot error/abort taxonomy. `tests/redirect.spec.ts` proves the Moonshot path also refuses to follow `Location`. Existing DeepSeek Messages tests keep the `/messages` contract.

## Related

- [Web capability seam](../architecture/2026-06-24-web-capability-seam.md) — providers register capabilities; `dsh-tool-web` owns the stable `web_search` schema.
- [Web default search](2026-07-31-web-default-search.md) — shipped composition still pins `searchProvider: deepseek-official`.
