# `@deepseek-ai/dsh-remote-attachments`

English | [中文](README.zh.md)

Pairing-scoped encrypted attachment blob store for Remote Access. Mobile uploads endpoint-encrypted ciphertext over HTTPS and receives a size- and expiry-bounded one-time capability scoped to exactly one Personal Pairing; Desktop exchanges that capability for the ciphertext exactly once, verifies its hash, decrypts on the endpoint, and submits the attachment into the existing Session path. The WSS Relay path carries only the bounded `offer-attachment` control message.

## Blob store

`RemoteAttachmentStoreProvider` (`ctx.remoteAttachments`) retains ciphertext and metadata only: capability, owning `PersonalPairingId`, ciphertext bytes, and expiry. The accepted protocol ceilings are fixed — 104,857,600 bytes (100 MiB) per blob and a 900,000 ms (15 minute) default capability lifetime; a deployment may configure lower values (`maxBlobBytes`, `capabilityLifetimeMs`), never higher. `maxRetainedBlobs` bounds total capacity and fails explicit `ATTACHMENT_CAPACITY` errors after sweeping expired entries; `sweepIntervalMs` drives the background expiry sweep. Every successful `consume`, lazy or swept expiry, and `revoke` removes the blob and its capability. Misconfiguration above a ceiling fails at construction.

Capabilities are 256-bit one-time values from `parseAttachmentCapability`; `consume` rejects cross-pairing use (`ATTACHMENT_PAIRING_MISMATCH`) without consuming the blob, unknown or already-consumed capabilities (`ATTACHMENT_CAPABILITY_INVALID`), and expired ones (`ATTACHMENT_EXPIRED`). `observe()` projects retained ciphertext and metadata for Platform-side operations; no plaintext exists on this side of the boundary.

## HTTP routes

The `remote-attachments-http` plugin (`@deepseek-ai/dsh-remote-attachments/http`) registers three exact routes over the mounted store and requires `webServer`, `remoteAttachments`, and the `remoteAttachmentAuthority` pairing seam:

- `POST /v1/remote-attachments` — raw ciphertext body; responds `201` with `{ capability, byteLength, expiresAt }`, or `413 ATTACHMENT_LIMIT_EXCEEDED` while streaming.
- `POST /v1/remote-attachments/consume` — `{ capability }` JSON; responds `200` with raw ciphertext, `403` cross-pairing, `404` unknown, or `410` expired.
- `POST /v1/remote-attachments/revoke` — `{ capability }` JSON; responds `204` and removes the blob.

## Pairing seam

`RemoteAttachmentAuthority.authenticate({ headers })` maps one HTTPS request to exactly one `PersonalPairingId`. The Personal Pairing layer (issue #31) owns the production implementation; it never sees attachment bytes. A missing authority service fails plugin load loudly.

## Model Experience

None, as attachment ciphertext and capabilities never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The in-process store matches the single-process Platform deployment; a multi-instance Platform needs a shared store with the same `RemoteAttachmentStoreService` semantics.
- The production `RemoteAttachmentAuthority` arrives with Personal Pairing (#31); tests use a header-based development authority.
