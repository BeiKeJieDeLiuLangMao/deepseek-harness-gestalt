# Agent Note: Assembled two-instance Remote Relay acceptance

Status: implemented

English | [中文](2026-08-19-two-instance-routing-assembled-acceptance.zh.md)

## Problem

Issue #32 requires Mobile and a paired Desktop to reach Remote Online through outbound connections even when each attaches to a different Platform Instance. The Relay slices — `RemoteRelayProvider`, the WSS Consumer, Redis coordination, and Desktop/Mobile endpoint lifecycles — already exist on the mobile-companion baseline, with a keyless example that hand-constructs two in-process backends. What the ticket still lacked is assembled evidence that two real Loader-booted Platform Instances, sharing test durable and Redis adapters, accept both endpoints through one non-sticky TLS listener, reject a route id without the current credential, forward only bounded ciphertext, resynchronize after instance loss, and become Remote Offline from Desktop window lifecycle.

## Decision

Keep every production seam unchanged and add one REAL-composition acceptance test at the HTTP/WSS Consumer:

`packages/platform/remote-access-http/tests/two-instance-assembled.spec.ts` boots two Loader compositions. Each mounts `WebServer`, `PersonalPairingProvider`, `RemoteRelayProvider`, Personal Pairing HTTP, and the Relay WSS Consumer. Both instances share `MemoryPersonalPairingAuthorityStore`, an in-memory `RelayRouteStore`, and one `RedisRelayCoordinator` over a test Redis bus. A local TLS listener round-robins each upgrade onto that instance's Relay WSS Consumer; `expectDirectUpgrade` separately opens the published `WebServer` WSS route. WebServer does not export the registered handler, so the TLS listener cannot proxy the upgraded socket onto the instance HTTP port. Desktop enables Mobile Access and confirms pairing on instance A; Mobile reads the sealed grant from instance B. Attach with the route id and a non-current credential returns `RELAY_ATTACHMENT_REJECTED`. Mobile and Desktop then attach through the TLS endpoint, complete one AES-GCM Companion round trip whose prompt never appears in coordinator publish payloads, survive disposal of the Desktop instance with a Desktop-authoritative resynchronization, and observe `REMOTE_OFFLINE` with no retained ciphertext after window-close, sleep, Mobile Access disablement, and quit.

Alibaba Cloud TLS load balancers, managed PostgreSQL/Redis/OSS, public DNS, and a reviewed product cipher remain deployment evidence. The test adapters stand in for those stores; they do not claim the production data plane.

## Alternatives considered

**Treat the existing `examples/two-instance-relay` snapshot as sufficient.** Rejected: that scenario boots one Loader plugin that then constructs two backends by hand, so it does not execute two Platform Instance compositions or the published WSS upgrade path on `WebServer`.

**Drive two child processes against a disposable `redis-server` and PostgreSQL.** Deferred: CI does not install those binaries, the Redis adapter already has a skipIf integration, and shared in-process test adapters keep the assembled path keyless and always runnable.

**Mount Remote Relay in `apps/platform` production boot.** Rejected for this ticket: the image still omits Remote Access, and changing production wiring is not required to prove the Consumer and provider composition.

## Consequences

Ticket #32's locally runnable criteria now have executed evidence on this baseline: two Loader-booted instances, one non-sticky TLS endpoint, credential-gated attach, ciphertext-only cross-instance forwarding, reconnect plus Desktop-authoritative resynchronization after instance exit, and Remote Offline from Desktop window lifecycle with no Relay offline queue. Production `apps/platform` boot, deployment TLS, and managed stores are untouched.

## Testing

`pnpm exec vitest run packages/platform/remote-access-http/tests/two-instance-assembled.spec.ts` — one assembled case against two Loader-composed WebServer + Remote Access processes over loopback TLS, with in-memory pairing-authority and route-store adapters plus a test Redis coordinator. The existing keyless example snapshot and package unit suites remain the lower-level coverage.

## Related

- Issue #32 (parent spec #27) — route one Paired Desktop across two Platform Instances.
- [Stateless two-instance Remote Relay](../architecture/2026-08-18-stateless-two-instance-remote-relay.md) — the provider, coordinator, and lifecycle decision this composition executes.
