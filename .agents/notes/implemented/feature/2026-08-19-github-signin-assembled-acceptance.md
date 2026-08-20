# Agent Note: Assembled GitHub sign-in acceptance for Desktop and Mobile

Status: implemented

English | [中文](2026-08-19-github-signin-assembled-acceptance.zh.md)

## Problem

Issue #30 asks both Desktop and Mobile to sign in to a Platform Account with GitHub. The client slices — `PlatformAccountInstallation`, `DesktopAccountController`, the bilingual privacy notice, the Mobile Account page, and the HTTP routes — already exist on the mobile-companion baseline, each with unit tests over fake transports. What the ticket still lacked is assembled evidence: two real installations signing in against one real Loader-composed Platform over TCP, account switching on a live installation, selective invalidation on sign-out, development/production namespace separation, and the Desktop Host controller (encrypted store, restart restore, refresh rotation) driving the real HTTP surface instead of a fake transport.

## Decision

Keep every production seam unchanged and add REAL-composition acceptance tests at the two seams the ticket names:

- `packages/platform/platform-account-http/tests/assembled.spec.ts` now boots one composition with two `PlatformAccountInstallation` clients (desktop and mobile kinds, separate stores). Both complete GitHub authorization; the desktop installation then switches to a third GitHub identity, which proves the Platform revokes only the replaced session (observed through `trackConnection` on a secondary `PlatformAccount` sharing the invalidation bus) and leaves the mobile session valid. After the first desktop login the test writes pairing-key and receipt material for that Account; after the switch those values survive under the first Account and are absent under the second. Signing out the desktop installation closes exactly its tracked connection and leaves the first Account's pairing-key and receipt in place; the mobile session survives until its own sign-out.
- The same file boots a second composition on the production side of the pair (distinct origin, OAuth client id, callback, credential reference, database identity, and identity namespace, with the same token-signing key) and proves a development session's access token and P-256 proof are rejected there with `SESSION_REVOKED` and `access token belongs to another identity namespace`.
- `apps/desktop/tests/platform-account-real.spec.ts` drives the production-shaped `DesktopAccountController` — `EncryptedDesktopAccountStore` over a UTF-8 passthrough (not Electron `safeStorage`), a mocked system-browser adapter, and scheduled polling — through a real Loader + TCP Platform: consent gate, opened GitHub HTTPS URL (S256, no scope, fixed `redirect_uri`, no token), signed polling to `signed-in`, restart restore from the passthrough record, access-token rotation after the fifteen-minute TTL, and sign-out that leaves the record idle and the revoked token rejected by Platform.

## Alternatives considered

**Extend the Desktop unit suite with another fake transport.** Rejected: the ticket's reopened blocker is assembled acceptance on a real Platform, and fakes already cover the state machine.

**Share one Loader-boot helper between the two spec files.** Deferred: `jscpd` runs over `packages` and `scripts` only, but the desktop composition selects its own environment pair and passthrough safeStorage adapter; extracting a cross-app test helper would couple an app spec to a package test layout for two call sites.

**Drive the Mobile React page against the real composition too.** Deferred: `MobileAccount` renders from `PlatformAccountInstallation` snapshots, and the installation's real-HTTP lifecycle is now covered assembled for both installation kinds; the page-level behavior tests cover rendering and consent gating.

## Consequences

Assembled tests prove, over loopback TCP with a fake GitHub provider: consent-gated login, PKCE S256 plus a fixed HTTPS callback and signed polling for desktop and mobile installations, a no-scope authorization URL, P-256 sessions with fifteen-minute access and rotating refresh, one-account-per-installation switching that revokes only the replaced session, pairing-key and receipt material that survives the switch and stays invisible under the new Account, current-installation sign-out that invalidates only that installation's session on a second in-process `PlatformAccount` sharing the invalidation bus, development/production identity-namespace rejection of a shared-signing-key access token with `access token belongs to another identity namespace`, and Desktop Host consent, signed-in polling, restart restore, refresh rotation, and sign-out. The Desktop Host store in that test is a UTF-8 passthrough, not Electron `safeStorage`. No runtime behavior changed; production wiring (`apps/platform/src/boot.ts`, Desktop Host, Mobile entry) is untouched.

Unit and snapshot suites still own `accountStorageNamespace` string construction, Personal Pairing survival as a Remote Access record, Desktop and Mobile presentation plus the bilingual notice text, core PKCE/expiry/proof-replay boundaries, `EncryptedDesktopAccountStore` atomic writes and Electron `safeStorage`, IndexedDB `CryptoKey` parsing, and Mobile React page rendering.

Real deployment under parent spec #27 still requires a trusted HTTPS origin, a real GitHub OAuth exchange that discards the provider token, two real Platform Instances, and managed datastores.

## Testing

`pnpm exec vitest run packages/platform/platform-account-http/tests/assembled.spec.ts apps/desktop/tests/platform-account-real.spec.ts` — assembled HTTP cases plus the Desktop Host lifecycle, all against real Loader-composed WebServer + PlatformAccount over loopback TCP with a fake GitHub provider. Existing unit suites (`apps/desktop/tests/platform-account.spec.ts`, `apps/mobile/tests/mobile-account.spec.ts`, `packages/platform/platform-account-client/tests/installation.client.spec.ts`) still cover presentation, `accountStorageNamespace`, and sign-out preservation of a `'personal-pairing'` placeholder. Remote Access assembled coverage of a real Personal Pairing record lives in `packages/platform/remote-access-http/tests/assembled.spec.ts`.

## Related

- Issue #30 (parent spec #27) — client-side GitHub sign-in on Desktop and Mobile.
- [Platform Account installation sessions](2026-08-17-platform-account-installation-sessions.md) — the session and proof design these compositions execute.
- [Desktop Host ownership of the Account lifecycle](../architecture/2026-08-16-deepseek-gestalt-desktop-host.md) — Desktop Host owns system-browser authorization and protected installation keys.
