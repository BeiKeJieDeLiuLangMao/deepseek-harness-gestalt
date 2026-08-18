# Agent Note: Explicit DeepSeek and Anthropic-protocol search cards

Status: implemented

English | [中文](2026-08-19-moonshot-search-wire-adaptation.zh.md)

## Problem

Gestalt ships one `web_search` tool and one settings card over `web-search-deepseek`. Users who need another Anthropic Messages search base — Kimi coding at `https://api.kimi.com/coding/v1` — had to overwrite that card's `baseURL` and guess whether the field wanted a DeepSeek Anthropic base, a Kimi coding base, or a dedicated retrieval URL. Guessing mixed protocols. The model-facing tool stays one `web_search`; the missing piece is an explicit choice of which Messages base the next search reads.

## Decision

The same provider still speaks only Anthropic Messages + `web_search_20250305`. The settings page now exposes two cards:

- **DeepSeek search** (`web-search-deepseek`) — official DeepSeek Anthropic base, default `https://api.deepseek.com/anthropic/v1`.
- **Anthropic-protocol search** (`web-search-anthropic`) — a Messages base the user names, for example `https://api.kimi.com/coding/v1`.

The DeepSeek section stores `backend: 'deepseek' | 'anthropic-messages'`. Each card's **Use this for web search** writes that field. The provider projects both sections per search and reads the card `backend` names. Dedicated retrieval (`POST /v1/search` with `text_query`) is a different protocol and stays out of this package.

## Alternatives considered

**Guess the protocol from the configured URL host or path.** Rejected: `api.kimi.com/coding/v1` is Messages search and `api.moonshot.cn/v1/search` is retrieval, so a host allowlist misroutes. The user has to know which URL family they typed.

**A second `WebSearchProvider` id plus `searchProvider` selection in `ctx.web`.** Deferred: the shipped composition pins `searchProvider: deepseek-official`, and `WebRuntime` captures that id at construction. Two cards over one provider id change the page without changing seam selection.

**One card with a protocol dropdown.** Rejected: the two homes need different copy and hints so a user can match DeepSeek official versus Kimi coding without reading a dropdown option.

## Consequences

A user who wants Kimi coding picks the Anthropic-protocol card, sets `https://api.kimi.com/coding/v1`, and clicks **Use this for web search**. A user who wants official DeepSeek picks the DeepSeek card. The leftover `baseURL` on the other card is not read. Moonshot dedicated search still needs its own provider package.

## Testing

`packages/web/web-search-deepseek/tests/settings.spec.ts` switches `backend` and asserts the next search hits the Anthropic card's `{baseURL}/messages`. Client card tests cover the use-this control and the second namespace registration. The plugin-config snapshot lists both card titles.

## Related

- [Web capability seam](../architecture/2026-06-24-web-capability-seam.md) — providers register capabilities; `dsh-tool-web` owns the stable `web_search` schema.
- [Web plugin configuration](2026-08-10-web-plugin-configuration.md) — settings cards bind one namespace each.
