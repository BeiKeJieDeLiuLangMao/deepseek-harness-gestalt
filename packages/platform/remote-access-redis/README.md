# Remote Access Redis

English | [中文](README.zh.md)

Redis coordination adapter for the stateless multi-instance Remote Relay. It uses the maintained `redis` client and an environment-scoped key prefix supplied by deployment. The Redis URL is secret-injected at runtime and is never logged or persisted by this package.

The adapter stores only expiring attachment directory values: opaque route and attachment ids, endpoint kind, Platform Instance id, connection token, route revision, and expiry. Conditional Lua refresh and unregister operations compare the connection token so cleanup from an old socket cannot delete a replacement. Direct Pub/Sub channels carry bounded Relay ciphertext envelopes to one live Platform Instance; a separate channel carries content-free route invalidations. Values are parsed and all wire ids are branded before they reach the Relay provider.

This package never creates Redis Streams, Lists, or another offline queue. A publish subscriber count is only transport admission: the sender waits for a bounded, content-free delivery acknowledgement correlated by an opaque id. A stale target, silent drop, or acknowledgement timeout therefore returns `REMOTE_OFFLINE`. Redis contains no prompt, Session, approval, model, Workspace, or other DSH business value.

## Model Experience

None, as Redis Relay coordination never enters a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Redis service provisioning, TLS, authentication, monitoring, and availability are deployment responsibilities.
- Durable route credential digests and revisions belong to the deployment's `RelayRouteStore`, not Redis coordination.
