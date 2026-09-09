# `@deepseek-ai/dsh-platform-account-core`

English | [中文](README.zh.md)

Platform Account provider. A Login Attempt lasts five minutes, carries random OAuth state and S256 PKCE, and can be consumed once with a signed polling token plus P-256 installation proof. The GitHub OAuth adapter requests no scope, rejects inherited non-empty scopes, retains only the immutable numeric id plus public login and avatar, and discards the provider token after identity lookup.

Completing a new Installation is rejected at the tenth-plus-one live Desktop or Mobile session for that Account, while a retry of the same Installation replaces the current session. `AccountBackend.consumeAuthorizedAttempt` counts that kind inside the same transaction that inserts the session. `trackConnection` checks every session admission through the backend, admits twenty closers for one Account, and rejects a missing, inactive, or twenty-first closer with `QUOTA` or `SESSION_REVOKED`. An injected `PlatformCapacityState` sheds `beginLogin` and a completing `pollLogin` with `PLATFORM_CAPACITY`; `apps/platform` boot does not inject that gate.

Account Sessions bind one Account to one Installation key and immutable Installation kind. Access tokens last 15 minutes. Refresh tokens rotate on every accepted use and expire after at most 30 days; an expiry timestamp is already invalid at equality, and refresh is rejected before proof consumption or rotation unless a full 15-minute access lifetime fits inside the absolute limit. Current Account and current Installation reads, refresh, and sign-out require a fresh, non-replayed proof. Proof timestamps accept up to five minutes of client clock skew; the signature still binds the operation and token, while the shared backend retains each consumed `jti` through the proof's last valid instant. The Installation read returns the session-owned id and kind rather than accepting either from its caller. A durable Mobile session without Installation presentation is admitted through persistence parsing, then revoked after proof verification with `SESSION_REVOKED`; clients clear it and require a new login that records the native presentation. Replacing, migrating, or signing out a session commits revocation before awaiting invalidation. The bus and each instance contain subscriber and connection-close failures independently, run every callback, and report aggregated completion errors.

`loadPlatformEnvironment` requires and selects a complete pair. Development and production cannot share an origin, callback, GitHub OAuth App id, credential reference, database identity, or identity namespace. The provider rejects a GitHub adapter or backend whose selected identity does not match before serving traffic.

## Extension Points

`AccountBackend` supplies atomic persistence, and `AccountInvalidationBus` supplies cross-instance delivery. `GitHubIdentityProvider` owns provider exchange. Production composition supplies all three; the in-memory implementations exist for keyless acceptance and development.

`configureAccountDeletion` binds existing product data owners and explicit retry/receipt-lifetime budgets. Acceptance atomically persists the operation and revokes all sessions; owner revocation precedes invalidation publication, and incomplete cleanup remains recoverable. Deleting accounts cannot complete login or refresh. Only the initiating Installation key can query or replace successor choices through the recovery receipt. Completion removes Account and session records; repeated registration creates a new id. A background sweep reports each failed Account and continues other cleanup and completed-receipt expiration. Compositions without this owner reject deletion with `DELETION_UNAVAILABLE`. [The deletion decision](../../../.agents/notes/implemented/feature/2026-09-09-mobile-account-deletion.md) defines ownership, ordering and verification.

## Model Experience

None, as Account authorization is outside agent sessions and model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- This package defines no production database, distributed invalidation, secret manager, rate limiter, or audit sink; the Platform deployment composition owns those adapters.
- The GitHub adapter supports OAuth Apps only and accepts public identity without provider scopes.
