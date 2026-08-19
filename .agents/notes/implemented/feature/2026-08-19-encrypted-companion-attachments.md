# Agent Note: Pairing-scoped encrypted attachment transfer

Status: implemented

English | [中文](2026-08-19-encrypted-companion-attachments.zh.md)

## Problem

A Mobile user must attach a file to a Desktop-owned Session without exposing plaintext to Platform and without pushing large frames through the live WSS Relay stream. The transfer needs a pairing-scoped capability whose size and expiry are bounded by the accepted ceilings (100 MiB per blob, fifteen-minute default lifetime), explicit failure for cross-pairing use, hash mismatch, expiry, interrupted transfer, and limit violations, and removal of the blob and its capability after successful receipt, expiry, or revocation. Personal Pairing itself (#31) is not built, so pairing-scoped identity can only be an injected seam.

## Decision

The encrypted path is split by boundary. `@deepseek-ai/dsh-remote-protocol` gains a bounded `offer-attachment` Companion operation (capability, SHA-256, exact byte count, expiry, bounded file name), an `attachment-rejected` result with protocol-native reasons, a 256-bit `AttachmentCapability` brand with its parser, fixed wire limits, and an endpoint attachment cipher (HKDF-SHA-256 → AES-256-GCM plus SHA-256 ciphertext hashing) linked only by Mobile and Desktop.

`@deepseek-ai/dsh-remote-attachments` owns the Platform side: `RemoteAttachmentStoreProvider` (`ctx.remoteAttachments`) retains ciphertext and metadata only, issues single-use capabilities scoped to one `PersonalPairingId`, enforces the per-blob ceiling and lifetime (configurable downward, never above the protocol ceilings), bounds retained-blob capacity with an explicit `ATTACHMENT_CAPACITY` error, sweeps expiry lazily and in the background, and removes blob plus capability on consume, expiry, and revocation. The `remote-attachments-http` plugin exposes upload/consume/revoke routes over the mounted store and authenticates each request through the `RemoteAttachmentAuthority` seam (`authenticate({ headers }) → PersonalPairingId`) that #31's pairing layer will implement; the plugin fails loudly when the seam is absent.

Mobile (`apps/mobile/src/companion-attachment.ts`) seals bytes with a pairing-derived key before upload and builds the bounded control message. Desktop (`apps/desktop/src/companion-attachments.ts`) checks expiry and byte ceiling, downloads, re-hashes the ciphertext, and only then decrypts and submits into the existing Session path; a hash mismatch never reaches the decryption key, and every rejection maps to one protocol-native reason returned to Mobile. Blob bytes move over HTTPS only; the WSS Relay path carries only the encrypted, bounded control message.

## Alternatives considered

**Stream the blob as Relay ciphertext frames.** The 65,535-byte ciphertext frame ceiling would turn one 100 MiB attachment into thousands of live frames on the WSS path, violating the bounded-control-message requirement and re-coupling bulk transfer to liveness. HTTPS upload/download keeps the live stream small.

**An OSS-backed blob store.** Production `gestalt-secret` access is viable, but it adds a second storage dependency and a lifecycle rule to express single-use consume and immediate revocation semantics that the in-process store already owns. The in-process `RemoteAttachmentStoreProvider` matches the current single-process Platform deployment and the `remote-access-redis` patterns can extend it to a shared store when a multi-instance Platform exists.

**A Desktop-owned blob channel.** Desktop is not a publicly reachable upload target for a phone on another network; Platform is the only rendezvous both endpoints already share.

## Consequences

The keyless assembled test proves criterion 6 mechanically: every Platform-retained byte (store `observe()` and every HTTP response chunk) is scanned for the plaintext subsequence and contains only ciphertext and metadata, while plaintext equality is asserted only at the Mobile seal and Desktop submit endpoints. Cross-pairing, hash mismatch (including tampered ciphertext and byte-count mismatch), expiry, interruption, per-blob ceiling, and capacity each fail with an explicit code or protocol-native reason in package and endpoint specs, and the runnable `examples/remote-protocol` snapshot shows the ciphertext-only Platform view end to end. What this costs: pairing identity remains a header-based development seam until #31 lands, and a multi-instance Platform must replace the in-process store with a shared implementation behind the unchanged `RemoteAttachmentStoreService`.
