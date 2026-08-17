# `@deepseek-ai/dsh-platform-account`

English | [中文](README.zh.md)

Service Definition for Platform Account identity and the Account Session bound to one Desktop or Mobile Installation. `AccountService` owns Login Attempt creation, GitHub callback completion, signed polling, access-token refresh, current-account reads, current-installation sign-out, and connection tracking through `ctx.platformAccount`.

The public types brand Account, Login Attempt, Account Session, Installation, and proof-JTI ids. Runtime `AccountError` exposes stable failure codes for invalid or expired attempts, invalid or replayed proof, and expired or revoked sessions; the `./types` subpath remains type-only.

## Model Experience

None, as Platform Account state adds no messages, tools, or prompt text.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Account deletion, session lists, remote sign-out, sign-out-all, recovery, and identity linking are not part of this service.
- Personal Pairings are a separate capability and are never deleted by `signOut`.
