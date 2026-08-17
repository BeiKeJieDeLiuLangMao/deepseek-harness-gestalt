# `@deepseek-ai/dsh-platform-account-http`

English | [中文](README.zh.md)

HTTP Consumer for `ctx.platformAccount`. It registers Login Attempt creation, the fixed `/v1/account/oauth/github/callback`, signed polling, refresh, current-account, and current-installation sign-out routes. Responses disable caching; errors use stable JSON envelopes. CORS admits only exact configured application origins, request bodies are capped at 64 KiB, and access-token operations carry installation proof in dedicated headers.

The callback returns a bilingual completion page and never redirects an OAuth code or provider token to an application URL.

## Model Experience

None, as installation UI rather than an agent consumes these routes.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- TLS termination, raw-IP log retention, rate limiting, and deployment observability belong to the Platform edge.
- The Consumer assumes the Platform composition mounted one authoritative Account provider.
