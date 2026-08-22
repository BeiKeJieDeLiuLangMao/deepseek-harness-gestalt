# Agent Note: Assembled two-instance Remote Relay acceptance

Status: implemented

English | [中文](2026-08-19-two-instance-routing-assembled-acceptance.zh.md)

## Problem

Issue #32 requires Mobile and a paired Desktop to reach Remote Online through outbound connections even when each attaches to a different Platform Instance. The Relay slices — `RemoteRelayProvider`, the WSS Consumer, Redis coordination, and Desktop/Mobile endpoint lifecycles — already exist on the mobile-companion baseline, with a keyless example that hand-constructs two in-process backends. What the ticket still lacked is assembled evidence that two Loader-booted Platform Instance compositions, sharing test durable and Redis adapters, accept both endpoints through one non-sticky TLS listener that reaches the published `WebServer` upgrade route, reject a route id without the current credential, forward only bounded ciphertext, resynchronize after instance loss, and become Remote Offline from Desktop window lifecycle.

## Decision

Keep every production seam unchanged and add one REAL-composition acceptance test at the HTTP/WSS Consumer:

`examples/two-instance-relay/tests/two-instance-relay.snapshot.ts` boots two in-process Loader compositions. Each mounts `WebServer`, `PersonalPairingProvider`, `RemoteRelayProvider`, Personal Pairing HTTP, and the published Relay WSS Consumer. Both compositions share `MemoryPersonalPairingAuthorityStore`, an in-memory `RelayRouteStore`, and one `RedisRelayCoordinator` over a test Redis bus. A local TLS listener terminates TLS and proxies each HTTP Upgrade onto `127.0.0.1:${instance.port}` so attach runs through `webServer.registerUpgrade`. Desktop enables Mobile Access and confirms pairing on instance A; Mobile reads the sealed grant from instance B. Attach with the route id and a non-current credential returns `RELAY_ATTACHMENT_REJECTED` on both the TLS endpoint and a direct `ws:` attach to instance A's published route. Mobile and Desktop then attach through the TLS endpoint, complete one AES-GCM Companion round trip whose published coordination frames decode as `ciphertext` whose payload is not Companion JSON containing the prompt, survive disposal of the Desktop composition with a Desktop-authoritative resynchronization, and observe `REMOTE_OFFLINE` after window-close, sleep, Mobile Access disablement, and quit. Recorded `set`/`eval` values contain no ciphertext frames; the Redis mock throws on List and Stream APIs.

Alibaba Cloud TLS load balancers, managed PostgreSQL/Redis/OSS, public DNS, mounting Remote Relay in `apps/platform`, a reviewed product cipher, and ticket #38 blob transfer remain deployment evidence. The test adapters stand in for those stores; they do not claim the production data plane.

## Alternatives considered

**Treat the existing `examples/two-instance-relay` snapshot as sufficient.** Rejected: that scenario boots one Loader plugin that then constructs two backends by hand and hands upgrades to a privately constructed WSS Consumer, so it does not execute two Platform Instance compositions or the published `WebServer` upgrade path.

**Hand a second `RelayWebSocketConsumer` the TLS socket.** Rejected: deleting the Loader's `registerUpgrade` would leave the round-trip green. The TLS front must proxy HTTP Upgrade onto the instance port.

**Drive two child processes against a disposable `redis-server` and PostgreSQL.** Deferred: CI does not install those binaries, the Redis adapter already has a skipIf integration, and shared in-process test adapters keep the assembled path keyless and always runnable.

**Mount Remote Relay in `apps/platform` production boot.** Rejected for this ticket: the image still omits Remote Access, and changing production wiring is not required to prove the Consumer and provider composition.

## Consequences

Ticket #32's locally runnable criteria have executed evidence on this baseline: two in-process Loader compositions, one non-sticky TLS endpoint that reaches the published WSS upgrade route, credential-gated attach, decoded ciphertext-only cross-instance forwarding, reconnect plus Desktop-authoritative resynchronization after instance exit, Remote Offline from Desktop window lifecycle, and no ciphertext retained in `set`/`eval` with List/Stream APIs forbidden. Production `apps/platform` boot, cloud TLS/DNS/certificates, managed PostgreSQL/Redis/OSS, the reviewed product cipher, and #38 blobs remain deferred.

## Testing

`pnpm exec vitest run examples/two-instance-relay/tests/two-instance-relay.snapshot.ts` — one assembled case against two in-process Loader compositions over loopback TLS, with in-memory pairing-authority and route-store adapters plus a test Redis coordinator. The existing keyless example snapshot and package unit suites remain the lower-level coverage.

## Related

- Issue #32 (parent spec #27) — route one Paired Desktop across two Platform Instances.
- [Stateless two-instance Remote Relay](../architecture/2026-08-18-stateless-two-instance-remote-relay.md) — the provider, coordinator, and lifecycle decision this composition executes.
