# Agent Note: Open-registration quotas and capacity shedding

Status: implemented

English | [中文](2026-08-19-open-registration-quotas-capacity.zh.md)

## Problem

Open GitHub registration would otherwise let one Account or one IP exhaust Platform installations, pairings, ciphertext uploads, push hints, and live connections. The [Mobile Companion proposal](../../proposed/feature/2026-08-17-mobile-companion.md) already rejected an allowlist, an account-count ceiling, automatic scaling, and an operator disable console. Quota numbers are spec-fixed security invariants; only the two-instance capacity watermark and its retry delay vary by deployment. A quota helper that is not invoked from login, pairing, blob, or WSS attach leaves those ceilings unenforced.

## Decision

Account owns the login-side ceilings and the shared `PlatformCapacityState` type: ten live Desktop installations, ten live Mobile installations, twenty concurrent tracked connections, and a 60-second hard-cap `retryAfter`. Completing `pollLogin` admits a replacement for an existing Installation and rejects the eleventh new Desktop or Mobile session with `QUOTA`. `trackConnection` admits the twentieth closer for one Account and rejects the next without closing established closers. An injected `PlatformCapacityState` sheds `beginLogin` and a completing `pollLogin` with `PLATFORM_CAPACITY`. A second GitHub identity still registers. `AccountBackend` counts live installations and resolves Account and Installation sessions so Postgres and memory backends apply the same caps.

Remote Access owns pairing, blob, and push ceilings and implements `MemoryPlatformCapacityGate` as `PlatformCapacityState`, so Account never depends on Remote Access. One Account may retain fifty Personal Pairings and create ten Pairing Challenges per hour; one IP may create thirty per hour. Five concurrent declared blobs, 100 MiB per blob, 1 GiB declared upload per Account per day, and 500 push hints per Account per day are enforced by `admitAttachmentBlob`, `releaseAttachmentBlob`, and `emitPushHint` without storing ciphertext. Confirming a pairing checks the fifty-pairing cap before handshake activation. Windowed rejections return remaining-window seconds, at least one; hard caps return 60 seconds. Established ciphertext streams and confirmed pairings are not throttled. Capacity shedding rejects new login, pairing, blob, and WSS attach, and does not reject push hints.

Pairing Challenge HTTP supplies only `req.socket.remoteAddress` as `clientIp`. `x-forwarded-for` is ignored because clients can spoof it; a trusted-proxy mapping remains deployment work. HTTP `QUOTA` and `PLATFORM_CAPACITY` map to status 429, JSON `retryAfter` seconds, and a `Retry-After` header. Relay `tryAcquire` holds one watermark slot for a new attachment, transfers the hold on replacement, and releases on close or failed attach. Per-process `trackConnection` maps enforce the twenty-connection Account cap; they are not a shared Redis counter.

The `decideOpenRegistration` helper admits usage equal to a ceiling (`>`) so unit tests can pin exact limits. Live providers compare current usage with `>=` before recording the next event.

The implementation includes no allowlist, account-count ceiling, autoscale, or operator-disable console. Blob and push HTTP operations are quota admission only; encrypted attachment transfer and product push delivery remain the [encrypted attachments](../../proposed/feature/2026-08-17-mobile-companion.md) and push tickets.

## Alternatives considered

**Leave `decideOpenRegistration` as the only evidence.** The helper does not run on login, pairing, blob, or WSS paths, so a passing unit test of the helper would not prove those ceilings.

**Trust `x-forwarded-for` for the per-IP hourly cap.** A client can set that header and escape the IP bucket. The TCP peer address is the only value this process observes without a trusted proxy.

**Count cancelled Pairing Challenges against the per-installation retained-record cap only.** The hourly Account and IP ceilings count issued challenges. Cleaned replay records still evict after five minutes; cleanup-failed tombstones remain the way to hold sixteen retained records across an hour.

**Put every ceiling in Remote Access, or import Remote Access types into Account.** Login quotas would then reverse the Account → Remote Access dependency. Account owns login identity; Remote Access consumes it.

**Share a Redis connection counter for the twenty-connection cap.** The twenty-connection cap is an Account-process map because `apps/platform` still boots Account without pairing or Relay. A deployment-shared counter is remaining two-instance evidence.

**Treat quota numbers as cordis.yml Config.** The Companion proposal fixed those integers as security invariants. Only the live WSS watermark and capacity retry delay stay deployment-validated Config.

**Shed established streams or disconnect live attachments at capacity.** The two-instance deployment preserves existing connections and rejects new acquisition until an operator expands capacity.

**Implement product blob storage and push delivery here.** Those protocols belong to the blocked attachment and push tickets. Declared-size admission still enforces the open-registration ceilings.

## Consequences

Open registration can stay open without an allowlist, while one Account or IP cannot unbounded-retain installations, pairings, blobs, or push hints. Operators still have to expand the two purchased instances by hand; CloudMonitor dashboards, a production shared capacity gate, a trusted-proxy client IP, a cross-instance connection counter, and the real blob and push product paths remain deployment or follow-up work. A cold instance that has not yet authorized a session does not enforce the connection ceiling until `authorizeAccess` or a completing `pollLogin` binds that session. Per-installation live, pending, and retained pairing caps stay in force beside the Account-wide quotas; an Installation can hit `PAIRING_RESOURCE_LIMIT` before `QUOTA` when cleanup-failed tombstones fill the sixteen-record cap.

## Testing

Account unit tests pin the tenth and eleventh Desktop and Mobile installations, same-installation replacement, the twentieth and twenty-first `trackConnection`, a second GitHub identity, and login shedding. A Loader plus real TCP Account HTTP scenario repeats those bounds. Remote Access unit tests pin hourly account and IP challenges, fifty pairings with replay-retention and hourly-window advances, five concurrent blobs, the 100 MiB blob ceiling, exact 1 GiB declared daily bytes, 500 push hints, stream admission under quota and shedding, and capacity shedding that leaves an established pairing listed. Real Personal Pairing HTTP repeats hourly, pairing, blob, push, and capacity envelopes, and proves a spoofed forwarding header does not isolate a second IP bucket. Relay tests hold one watermark slot, reject a new attach with the gate retry delay, keep an established receive path, and release on close or failed authorize. Clients preserve `QUOTA` / `PLATFORM_CAPACITY` and integer `retryAfter`.

## Related

- [Mobile Companion proposal](../../proposed/feature/2026-08-17-mobile-companion.md) — parent open-registration and capacity decisions.
- [Platform Account installation sessions](2026-08-17-platform-account-installation-sessions.md) — the sessions these installation and connection ceilings count.
