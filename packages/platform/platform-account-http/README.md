---
description: "HTTP consumer for Platform Account login, fixed GitHub callback, sessions, and current-installation sign-out."
kind: "package-reference"
---

# `@deepseek-ai/dsh-platform-account-http`

English | [中文](README.zh.md)

## Summary

HTTP Consumer for `ctx.platformAccount`. It registers Login Attempt creation, the fixed `/v1/account/oauth/github/callback`, signed polling, refresh, current-account, current-installation sign-out, and Desktop Mobile Installation management routes. `GET /v1/account/mobile-installations` lists the authenticated Desktop Account's active Mobile targets; `POST /v1/account/mobile-installations/revoke` binds one opaque target to the accompanying proof. `INSTALLATION_FORBIDDEN` returns HTTP 403 and `INSTALLATION_NOT_FOUND` returns 404. Responses disable caching; errors use stable JSON envelopes. `QUOTA` and `PLATFORM_CAPACITY` return HTTP 429, a `Retry-After` header, and JSON `retryAfter` in seconds. Its required non-empty `origins` Config must include the Account provider's selected validated environment origin; every additional standard or custom tuple origin is validated exactly, while paths and opaque `null` are rejected before route registration. Request bodies are capped at 64 KiB and parsed through the `@deepseek-ai/dsh-host-webserver` JSON helpers with Account-owned codes and copy, and access-token operations carry branded single-use proof ids in dedicated headers.

The callback returns a bilingual completion page and never redirects an OAuth code or provider token to an application URL.

`POST /v1/account/deletion/plan` and `POST /v1/account/deletion` require Account bearer and Installation-proof headers. The deletion body contains the operation id, random recovery token and explicit project successor memberships. `POST /v1/account/deletion/recovery` uses the receipt and initiating Installation proof in JSON; it accepts no ordinary session authority and can replace successors only after an action-required result. Every route retains the same exact origins, body limit and no-cache response policy.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through login and Account Session routes that authorize Project Membership and Personal Pairing flows used by model-facing consumers.

#### KV Cache effect

The HTTP layer adds no stable request prefix; successful authorization changes the downstream identity and pairing data available to agent work.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- TLS termination, raw-IP log retention, rate limiting, and deployment observability belong to the Platform edge.
- The Consumer assumes the Platform composition mounted one authoritative Account provider.

No runtime invariant companion is published because this HTTP Consumer retains no Account state beyond WebServer route effects owned by the WebServer and Account services.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
