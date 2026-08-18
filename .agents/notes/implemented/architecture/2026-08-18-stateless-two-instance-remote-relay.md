# Agent Note: Route paired endpoints through stateless Platform Instances

Status: implemented

English | [中文](2026-08-18-stateless-two-instance-remote-relay.zh.md)

## Problem

Mobile and a paired Desktop may reach different Platform Instances behind one non-sticky endpoint. A route id cannot be sufficient attachment authority, and Platform must not receive DSH Session, prompt, approval, model, Workspace, or other Companion business values. Rolling replacement must recover without migrating a live socket or retaining an offline mutation. Desktop process lifecycle must also remain the truth for whether the remote endpoint is online.

## Decision

Remote Access owns a `ctx.remoteRelay` capability separate from the [Relay Transport and encrypted Companion protocols](2026-08-18-versioned-remote-protocol.md). `RemoteRelayProvider` is stateless with respect to deployment data. Every instance receives the same `RelayRouteStore` and `RelayCoordinator` interfaces plus an opaque branded instance id and explicit validated limits. A 32-byte canonical base64url Relay credential is generated with a cryptographic entropy source, returned only to the endpoint authority, hashed before persistence, and rotated by monotonically increasing route revision. Attach requires both the route id and current credential. Rotation and revocation fan out a content-free invalidation and close older local attachments.

The minimum persistent route record contains the route identity, credential digest, monotonic revision, revocation state, and deployment-owned pairing association. It contains no plaintext Companion or Harness value. The Redis coordinator owns only ephemeral expiring directory entries, direct instance Pub/Sub, and invalidation. Directory entries contain route and attachment ids, endpoint kind, Platform Instance id, a stale-cleanup-safe connection token, revision, and expiry. Conditional refresh and unregister compare the connection token. Pub/Sub events contain the bounded Relay ciphertext frame plus target connection token and revision. Redis Streams, Lists, and other offline queues are not used.

One exact WSS Consumer requires an attach frame before any ciphertext or heartbeat, disables compression, applies the protocol frame ceiling and a validated attach timeout, serializes frames, and drains attachment cleanup with socket teardown. A missing or expired target, absent instance subscriber, disconnected endpoint, or offline send returns `REMOTE_OFFLINE`; nothing is retained for replay. Per-instance capacity rejects only new attachments with a retry delay. Per-target buffered ciphertext bytes are bounded; exceeding the limit disconnects the slow consumer. Heartbeats revalidate the credential digest and revision, conditionally refresh the directory, and expire attachments that stop proving liveness. Instance shutdown observes every connection, writer, directory, and subscription cleanup through all-settled aggregation.

Mobile and Desktop acquire outbound connections through the deployment's single non-sticky TLS endpoint. Physical socket loss starts a new acquisition after a validated delay. Desktop supplies a mandatory authoritative encrypted resynchronization callback after every successful attachment, so rolling replacement rebuilds state instead of migrating a live socket. The endpoint controller never retains an offline mutation. Desktop Settings starts Relay only while Mobile Access is enabled; window close quits the Desktop process, and sleep, quit, sign-out, or disabling Mobile Access stops and drains the connection. No daemon, background Host, or remote wake path exists.

The assembled keyless scenario runs two real WSS Platform backends and a Redis-compatible shared coordinator. Mobile and Desktop deliberately land on different instances, complete one encrypted Companion round trip, replace the Desktop instance, reconnect and resynchronize, then prove an offline target yields `REMOTE_OFFLINE` with zero queued events. Its harness-only AES-GCM channel does not enter production. The independent Noise security gate continues to keep product pairing and Relay activation fail-closed.

## Alternatives considered

**Use load-balancer stickiness.** Sticky routing hides instance ownership in edge state and does not survive rolling replacement. The shared expiring directory makes every connection and every instance disposable.

**Use a durable broker queue.** Queuing ciphertext would create offline delivery semantics, retention, replay, deletion, and product policy not required by Remote Companion. Direct Pub/Sub reports the live miss immediately.

**Store Companion objects in Platform.** Parsing or persisting application values would collapse the protocol separation and expose DSH authority to the centralized service. Platform forwards only the already bounded ciphertext envelope.

**Run a background Desktop Host.** A daemon or remote wake path would make window state misleading and add a new installation lifecycle. Closing the only Desktop window instead exits the process and makes the route offline.

**Integrate proof-local Snow code.** Transport delivery does not authorize product cryptography. The reviewed provider remains an independent gate, and the executable acceptance scenario stays explicitly keyless.

## Consequences

Two Platform Instances can share one endpoint without connection affinity, and rolling replacement loses only ephemeral sockets. Route ids remain non-secret locators, credential rotation and revocation have cross-instance effect, and the coordinator cannot inspect Companion business values. The trade-off is that endpoint reconnection and Desktop resynchronization are required after every instance loss, while offline Mobile work fails immediately and must be retried by an explicit future product action rather than infrastructure replay. Cloud provisioning, TLS, durable route-store implementation, Redis availability, and the reviewed product cryptographic provider remain deployment work rather than claims of this repository.
