---
description: "Redis ephemeral coordination provider for the multi-instance Remote Relay."
kind: "package-reference"
---

# Remote Access Redis

English | [中文](README.zh.md)

## Summary

Coordinate stateless Remote Relay instances through expiring Redis directory entries and bounded ciphertext Pub/Sub envelopes. Deployment supplies the environment key prefix and secret Redis URL, which the package never logs or persists. Token-checked refresh and unregister operations prevent stale socket cleanup from deleting a replacement.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

Redis coordination adapter for the stateless multi-instance Remote Relay. It uses the maintained `redis` client and an environment-scoped key prefix supplied by deployment. The Redis URL is secret-injected at runtime and is never logged or persisted by this package.

The adapter stores only expiring attachment directory values: opaque route and attachment ids, endpoint kind, Platform Instance id, connection token, route revision, and expiry. Conditional Lua refresh and unregister operations compare the connection token so cleanup from an old socket cannot delete a replacement. Direct Pub/Sub channels carry bounded Relay ciphertext envelopes to one live Platform Instance; a separate channel carries content-free route invalidations. Values are parsed and all wire ids are branded before they reach the Relay provider.

This package never creates Redis Streams, Lists, or another offline queue. A publish subscriber count is only transport admission: the sender waits for a bounded, content-free delivery acknowledgement correlated by an opaque id. A stale target, silent drop, or acknowledgement timeout therefore returns `REMOTE_OFFLINE`. Redis contains no prompt, Session, approval, model, Workspace, or other DSH business value.

<a id="model-experience"></a>
## Model Experience

None, as the Redis Provider carries Relay routes and ciphertext without creating model-bound content.

#### KV Cache effect

The Redis Provider adds no model request content, so it does not affect provider cache reuse.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Redis service provisioning, TLS, authentication, monitoring, and availability are deployment responsibilities.
- Durable route credential digests and revisions belong to the deployment's `RelayRouteStore`, not Redis coordination.

No runtime invariant companion is published because each Redis coordinator operation validates its external values directly and exposes no independent event and state-reader pair.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
