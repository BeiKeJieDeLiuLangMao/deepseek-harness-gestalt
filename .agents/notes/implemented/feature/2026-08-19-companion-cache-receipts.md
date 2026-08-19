# Agent Note: Companion Cache and uncertain-operation settlement

Status: implemented

English | [中文](2026-08-19-companion-cache-receipts.zh.md)

## Problem

Issue #40 (part of #27): while Remote Offline, Mobile must keep showing last-confirmed Workspace/Session metadata and transcripts without giving them away at rest, must refuse every mutation, and must resolve mutations whose Desktop result was lost across a disconnect — without becoming an offline outbox that silently replays work. Clearing one Paired Desktop's cached content must not destroy the pairing keys that keep the pairing valid.

## Decision

**One settlement controller, no outbox.** `CompanionUncertainOperationSettlement` owns the entire uncertain-operation lifecycle: gating, transmission acknowledgment, receipt persistence, and reconciliation. The transport adapter contract (`CompanionMutationTransport`) requires `send` to invoke an `onTransmitted` hook exactly once after the mutation left the device; only then does the controller persist an `unknown` Operation Receipt. There is deliberately no retry, queue, or replay path anywhere in the controller — reconciliation reads Desktop's authoritative answer by operation id through the protocol's new `query-operation-status` operation and settles each receipt to `committed` (keeping Desktop's original result) or `not-submitted` (explicit absence). Uncertainty is user-visible state, never a pending send.

**Encryption keys derive through the Personal Pairing seam.** #31 is not done; the cache treats per-desktop AES-GCM keys as an injected `CompanionCacheKeySource`. Production wiring will derive cache keys from the pairing material #31 establishes; no pairing logic lives here. Each record carries a fresh random 12-byte IV, so identical plaintexts seal differently.

**The exclusion list is an allowlist enforced at the cache boundary.** `companionCacheAdmits` admits exactly `workspace-metadata`, `session-metadata`, and `transcript`; everything else — attachment bytes, terminal content, spill files, credentials, and any unknown kind — stays out, and `CompanionCache.saveOpenedContent` fails loud on excluded kinds rather than silently skipping.

**Offline gating sits in the operation that makes the decision.** `transmit` refuses before touching the transport when Remote is Offline, for every mutation kind (prompt, cancel, approval, question, attachment, other); cache reads are unaffected because they never pass through the controller.

**Cache rows and pairing keys live in different stores.** `IndexedDbCompanionCacheStore` owns its own database (`deepseek-gestalt-companion-cache`, stores `content` and `receipts`), following the `IndexedDbInstallationAccountStore` precedent. `clearDesktop` deletes only that desktop's rows in that database, so pairing-key records — owned by the pairing seam's storage — survive by construction, and the test proves it against a paired-key fixture.

**Protocol extension, not a new channel.** The `query-operation-status` operation and `status` results (committed-with-original, or explicit `absent`) extend the existing versioned Companion codec: decoding rejects a status answer whose embedded confirmed result names a different operation id, and both committed and absent markers cannot coexist. Desktop-side answering is the relay endpoint's concern (#32-independent); the codec and Mobile settlement ship here.

## Consequences

`CompanionCache`, `WebCryptoCompanionCacheCipher`, `IndexedDbCompanionCacheStore`, and `CompanionUncertainOperationSettlement` ship in `apps/mobile/src/companion-cache.ts` with pure gating helpers. The Companion codec carries `query-operation-status` and the two `status` results. Desktop-side answering of status queries is the relay endpoint integration's concern and remains a seam: `CompanionMutationTransport` is the injected adapter, and cache encryption keys arrive through `CompanionCacheKeySource` until #31 supplies real pairing-derived keys. `apps/mobile/tests/companion-cache.spec.ts` proves ciphertext-at-rest and per-desktop key separation, the exclusion list, offline gating (transport send count stays 0, receipts stay empty, cache read succeeds), receipt-only-after-transmission (receipt observed inside the send window), reconciliation semantics, no-auto-replay (mutation send count unchanged through reconciliation and an offline retransmit attempt), and clear-preserves-pairing-keys. `packages/platform/remote-protocol/tests/companion.spec.ts` proves the codec round-trips and rejects forged status answers, and the assembled keyless example (`examples/remote-protocol`) carries a reconnect status-query leg end-to-end through the Loader-booted snapshot.

## Alternatives considered

- **An offline outbox that replays uncertain operations on reconnect** — rejected: Desktop-authoritative mutations must never be re-sent on Mobile's own initiative; uncertainty resolves only by Desktop's answer per operation id.
- **A separate readiness/rollback state machine beside the controller** — rejected per the one-lifecycle-controller rule; transmission acknowledgment and reconciliation are the same operation's phases.
- **Encrypting receipts too** — receipts carry only operation ids and settlement status, no opened content, so per-desktop AES-GCM protection targets the content rows that actually hold Workspace/Session data.
