# Agent Note: Assembled GitHub sign-in acceptance for Desktop and Mobile

Status: implemented

English | [中文](2026-08-19-github-signin-assembled-acceptance.zh.md)

## Problem

Issue #30 asks both Desktop and Mobile to sign in to a Platform Account with GitHub. The client slices — `PlatformAccountInstallation`, `DesktopAccountController`, the bilingual privacy notice, the Mobile Account page, and the HTTP routes — already exist on the mobile-companion baseline, each with unit tests over fake transports. What the ticket still lacked is assembled evidence: two real installations signing in against one real Loader-composed Platform over TCP, account switching on a live installation, selective invalidation on sign-out, development/production namespace separation, and the Desktop Host controller (encrypted store, restart restore, refresh rotation) driving the real HTTP surface instead of a fake transport.

## Decision

Keep every production seam unchanged and add REAL-composition acceptance tests at the two seams the ticket names:

- `packages/platform/platform-account-http/tests/assembled.spec.ts` now boots one composition with two `PlatformAccountInstallation` clients (desktop and mobile kinds, separate stores). Both complete GitHub authorization; the desktop installation then switches to a third GitHub identity, which proves the Platform revokes only the replaced session (observed through `trackConnection` on a secondary `PlatformAccount` sharing the invalidation bus), leaves the mobile session valid, and hands the installation a fresh account namespace via `accountStorageNamespace`. Signing out the desktop installation closes exactly its tracked connection; the mobile session survives until its own sign-out.
- The same file boots a second composition on the production side of the pair (distinct OAuth client id, callback, database, identity namespace, and token-signing key) and proves a development session's access token and P-256 proof are rejected there with `SESSION_REVOKED`: identity namespaces do not interoperate.
- `apps/desktop/tests/platform-account-real.spec.ts` drives the production-shaped `DesktopAccountController` — `EncryptedDesktopAccountStore`, system-browser adapter, scheduled polling — through a real Loader + TCP Platform: consent gate, signed polling to `signed-in`, restart restore from the encrypted record, access-token rotation after the fifteen-minute TTL, and sign-out that leaves the record idle and the revoked token rejected by Platform.

## Alternatives considered

**Extend the Desktop unit suite with another fake transport.** Rejected: the ticket's reopened blocker is assembled acceptance on a real Platform, and fakes already cover the state machine.

**Share one Loader-boot helper between the two spec files.** Deferred: `jscpd` runs over `packages` and `scripts` only, but the desktop composition selects its own environment pair and passthrough safeStorage adapter; extracting a cross-app test helper would couple an app spec to a package test layout for two call sites.

**Drive the Mobile React page against the real composition too.** Deferred: `MobileAccount` renders from `PlatformAccountInstallation` snapshots, and the installation's real-HTTP lifecycle is now covered assembled for both installation kinds; the page-level behavior tests cover rendering and consent gating.

## Consequences

Ticket #30's acceptance criteria now have executed, keyless evidence on this baseline: consent-gated bilingual notice, PKCE + fixed HTTPS callback + signed polling (existing tests plus the two-installation case), no-scope authorization URL, P-256 sessions with fifteen-minute access and rotating refresh, one-account-per-installation switching with isolated material namespaces, current-installation sign-out that invalidates only that installation's session across Platform instances, and dev/prod namespace separation. No runtime behavior changed; production wiring (`apps/platform/src/boot.ts`, Desktop Host, Mobile entry) is untouched.

## Testing

`pnpm exec vitest run packages/platform/platform-account-http/tests/assembled.spec.ts apps/desktop/tests/platform-account-real.spec.ts` — five assembled cases plus the Desktop Host lifecycle, all against real Loader-composed WebServer + PlatformAccount over loopback TCP with a fake GitHub provider. Existing unit suites (`apps/desktop/tests/platform-account.spec.ts`, `apps/mobile/tests/mobile-account.spec.ts`, `packages/platform/platform-account-client/tests/installation.client.spec.ts`) still pass unchanged.

## Related

- Issue #30 (parent spec #27) — client-side GitHub sign-in on Desktop and Mobile.
- [Platform Account installation sessions](2026-08-17-platform-account-installation-sessions.md) — the session and proof design these compositions execute.
- [Desktop Host ownership of the Account lifecycle](../architecture/2026-08-16-deepseek-gestalt-desktop-host.md) — Desktop Host owns system-browser authorization and protected installation keys.
