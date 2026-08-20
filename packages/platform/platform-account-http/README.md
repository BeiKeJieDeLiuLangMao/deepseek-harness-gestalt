# `@deepseek-ai/dsh-platform-account-http`

English | [中文](README.zh.md)

HTTP Consumer for `ctx.platformAccount`. It registers Login Attempt creation, the fixed `/v1/account/oauth/github/callback`, signed polling, refresh, current-account, and current-installation sign-out routes. Responses disable caching; errors use stable JSON envelopes. `QUOTA` and `PLATFORM_CAPACITY` return HTTP 429, a `Retry-After` header, and JSON `retryAfter` in seconds. Its required CORS origin must exactly equal the Account provider's selected validated environment origin or composition fails before route registration. Request bodies are capped at 64 KiB and parsed through the `@deepseek-ai/dsh-host-webserver` JSON helpers with Account-owned codes and copy, and access-token operations carry branded single-use proof ids in dedicated headers.

The callback returns a bilingual completion page and never redirects an OAuth code or provider token to an application URL.

## Model Experience

None, as installation UI rather than an agent consumes these routes.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- TLS termination, raw-IP log retention, rate limiting, and deployment observability belong to the Platform edge.
- The Consumer assumes the Platform composition mounted one authoritative Account provider.
