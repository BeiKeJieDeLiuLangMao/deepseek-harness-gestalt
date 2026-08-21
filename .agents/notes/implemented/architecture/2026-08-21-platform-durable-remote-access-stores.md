# Agent Note: Durable Platform Remote Access stores

Status: implemented

English | [中文](2026-08-21-platform-durable-remote-access-stores.zh.md)

## Problem

Two production Platform Instances sit behind one non-sticky TLS balancer and share PostgreSQL. Pairing challenges, confirmed Mobile authority, and Relay credential digests cannot live in process memory, or a Desktop enable on one host is invisible to a Mobile completion on the other. Those adapters are shared by the later Snow pairing and Relay mount.

## Decision

[`apps/platform`](../../../../apps/platform/src/boot.ts) migrates two PostgreSQL adapters at listen: [`PostgresPersonalPairingAuthorityStore`](../../../../apps/platform/src/postgres-pairing-store.ts) owns Desktop routes, confirmed Mobile pairing results, and the exclusive pairing-transaction document, and [`PostgresRelayRouteStore`](../../../../apps/platform/src/postgres-route-store.ts) owns hashed Relay credentials and monotonic revisions. [`pairing-state-codec.ts`](../../../../apps/platform/src/pairing-state-codec.ts) encodes the exclusive `PersonalPairingTransactionState` Maps, including orphan cleanup identity, as jsonb. `runPairingTransaction` takes `SELECT … FOR UPDATE` on one row keyed by database identity so both instances serialize the same lease. Production listen mounts pairing HTTP and Relay WSS with [`SnowPairingHandshakeProvider`](2026-08-21-snow-product-handshake.md). `DevelopmentKeylessPairingHandshakeProvider` is never selected by this listen process.

## Alternatives considered

**Mount pairing HTTP and Relay WSS with the development keyless handshake.** Rejected: production listen mounts Snow. Keyless adapters remain development-only.

**Keep in-memory stores now and add PostgreSQL when Relay mounts.** Rejected: the tables must exist before the first enable or confirm crosses instances, and listen already owns the Account PostgreSQL pool.

**Give each instance a private pairing database.** Rejected: a non-sticky balancer would split one Personal Pairing lifecycle across two authorities.

## Consequences

The same adapters and Redis coordinator serve the Snow pairing and Relay mount. Keyless adapters remain development-only.

## Testing

[`apps/platform/tests/pairing-state-codec.spec.ts`](../../../../apps/platform/tests/pairing-state-codec.spec.ts) and [`apps/platform/tests/postgres-remote-access-stores.spec.ts`](../../../../apps/platform/tests/postgres-remote-access-stores.spec.ts) pin codec rejection, orphan identity, Desktop route keep-or-replace, Mobile collision, exclusive transaction rollback, and route rotate/issue/authorize/revoke. [`production-env.spec.ts`](../../../../apps/platform/tests/production-env.spec.ts) pins listen migrating both stores and importing Snow rather than the keyless handshake.
