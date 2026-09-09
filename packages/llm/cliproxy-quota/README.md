# @deepseek-ai/dsh-cliproxy-quota

English | [中文](README.zh.md)

Read-only quota observation for CLIProxyAPI account-pool credentials. One entry — `createQuotaObserver({ transport })` — probes an account through the injected trusted transport and returns a sanitized `QuotaObservation`: a `known` / `partial` / `unsupported` / `failure` verdict, the sampling instant `observedAt`, and per-window facts.

## Trust and read-only model

The package never holds the CLIProxyAPI management secret and never sees an account credential. Probe headers carry the literal `$TOKEN$` placeholder; only the Host-owned `QuotaObservationTransport` substitutes it when forwarding through the management API's request facility. The runtime owner injects that transport; this package defines its narrow surface (`QuotaProbeRequest` / `QuotaProbeResponse`).

Every probe is read-only: GET requests plus the Antigravity quota-summary POST whose body is only the project id. The package sends no inference request (the upstream xAI paid health check, which pairs `/v1/me` with a chat completion, is not ported) and performs no mutation (the Codex reset-credit consume operation does not exist here). Paid xAI accounts report `unsupported`; when the Host-derived tier is unknown and the billing endpoints yield nothing, the observation says so rather than guessing.

## Observation semantics

Window fields the source did not supply stay absent — nothing reads as zero, full, or a fabricated balance. `periodHours: null` marks a window whose duration the source did not establish (Antigravity accepts `5h`/`five-hour`/`five_hour` and `weekly`/`week`; any other spelling keeps the balance and reset but no duration). A reset instant resolves from ISO-8601, Unix seconds or milliseconds, or a seconds-from-now offset against the sampling clock. Consumers keep stale samples by comparing `observedAt`; the observer itself never retries, caches, or schedules.

`known` means every fact the provider's probe expects arrived; `partial` means some did (a missing Claude named window, a failed Codex reset-credits listing, one of two xAI billing periods); `failure` means no usable fact (the error is bounded and credential-redacted); `unsupported` means no read-only probe exists for that account state.

## Provider probes

| Provider | Endpoint(s) | Window facts |
| --- | --- | --- |
| Claude | `GET api.anthropic.com/api/oauth/usage` | named windows (`five_hour`, `seven_day*`) with `utilization` + `resets_at`; a `weekly_scoped` Fable limit replaces `iguana_necktie` |
| Codex | `GET chatgpt.com/backend-api/wham/usage`, `GET …/rate-limit-reset-credits` | `primary`/`secondary` windows classified by `limit_window_seconds` (5h / weekly / monthly), `plan_type`, read-only reset-credit counts |
| Antigravity | `POST cloudcode-pa…/v1internal:retrieveUserQuotaSummary` (daily, sandbox, prod fallback chain) | buckets with `remainingFraction`, explicit `window`, `resetTime`; requires the auth-file `projectId` metadata |
| Kimi | `GET api.kimi.com/coding/v1/usages` | `usage` summary plus `limits[]` rows with counters, explicit `duration`+`timeUnit` or label-keyword periods |
| xAI | `GET cli-chat-proxy.grok.com/v1/billing[?format=credits]` | weekly credit percent and monthly cent counters; period length from the payload's own start→end span |

Probe construction and payload normalization are ported from the official CLIProxyAPI management center ([router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center) at `ed5f1c48e11ba7335f1e8f676f228c280196af85`, MIT); [NOTICE](NOTICE) carries the license text and the module-level import map. `isPaidXaiCredential` is exported for the Host to derive the non-secret `xaiAccountKind` metadata from an auth-file record.

## Known Limitations and Deferred Work

- The Kimi, xAI, and Antigravity provider payload shapes are taken from the upstream management center's parsers and have not been re-verified against live endpoints in this repository; drift surfaces as `failure` or `partial`, never as fabricated numbers.
- The Antigravity probe depends on the auth-file carrying a GCP project id; accounts without one report `failure` (`antigravity account metadata lacks a project id`) until the roster supplies that metadata.
- Codex window classification keeps the upstream primary/secondary ordering fallback for payloads without `limit_window_seconds`; a future upstream that emits more than one unclassified pair collapses into the same two keys.
- Kimi `periodHours` falls back to label keywords (`daily`/`weekly`/`monthly`/`5h`) when explicit duration metadata is absent, matching upstream behavior; an unlabeled window yields `null`.
