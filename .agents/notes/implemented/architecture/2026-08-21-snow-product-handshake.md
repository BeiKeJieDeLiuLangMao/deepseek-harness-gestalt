# Agent Note: Product Snow Personal Pairing handshake

Status: implemented

English | [中文](2026-08-21-snow-product-handshake.zh.md)

## Problem

Production listen migrated Personal Pairing and Relay tables but left pairing HTTP and Relay WSS unmounted. Desktop and Mobile product entries stayed fail-closed. The committed Snow 0.10.0 proof is not a product adapter: it has no `PairingHandshakeProvider`, and XKpsk3 needs three messages while complete-challenge HTTP is one Mobile request.

## Decision

Product owner `BeiKeJieDeLiuLangMao` authorized product integration of the committed Snow 0.10.0 path on 2026-08-21 with the instruction「PASS，可以推进」. This record is owner authorization, not a second-reviewer affiliation, tool-version, or vector-provenance form.

[`@deepseek-ai/dsh-noise-channel`](../../../../packages/platform/noise-channel/README.md) is the thin Snow adapter. It generates Desktop static and ephemeral keys with Snow, stores those privates in challenge state, and rebuilds the responder on any instance with Snow's documented `fixed_ephemeral_key_for_testing_only` hook. Invitation links carry `spk` (32-byte Desktop public key). `completeChallenge` consumes message 1 and returns message 2; Desktop does not list that pending row. `finishChallenge` consumes message 3, writes the finished handshake hash as the pairing key, and publishes authentication words. `DevelopmentKeylessPairingHandshakeProvider` remains development-only.

[`apps/platform/src/boot.ts`](../../../../apps/platform/src/boot.ts) mounts `PersonalPairingProvider` with `SnowPairingHandshakeProvider`, `RemoteRelayProvider` over the existing PostgreSQL stores and a dedicated Redis coordinator, pairing HTTP, and Relay WSS at `/v1/remote-access/relay`. Relay tunables are required `PLATFORM_RELAY_*` Environment names. Production Desktop and Mobile select the real pairing HTTP and WSS controllers; development still requires the keyless flags.

## Alternatives considered

**Mount `DevelopmentKeylessPairingHandshakeProvider` on production listen.** Rejected: keyless SHA-256 remains a development composition. Owner PASS admits Snow, not keyless.

**Change first pairing to IKpsk2 so one HTTP round-trip finishes the handshake.** Rejected: the proof admits XKpsk3. The extra `finish-challenge` operation preserves that protocol on the existing invitation HTTP.

**Keep HandshakeState only in process memory.** Rejected: the balancer is non-sticky. Durable challenge state plus Snow reconstruction is the two-instance path.

**Treat this chat PASS as a completed independent-reviewer checklist.** Rejected: the proof document still describes that checklist. This note records owner authorization so product code can mount; it does not invent reviewer affiliation.

## Consequences

Operated `www.gestaltrun.com` can complete Personal Pairing after Environment `production` receives the new Relay tunables and a later explicit image apply. Companion application frames still use the development AES-GCM seal until pairing-key HKDF is wired. IK reconnect is not assembled on WSS attach. X25519 still runs in WASM process memory.

## Testing

[`packages/platform/noise-channel/tests/handshake.spec.ts`](../../../../packages/platform/noise-channel/tests/handshake.spec.ts) completes XKpsk3 across Mobile and a rebuilt responder and opens a sealed Relay grant. [`apps/platform/tests/production-env.spec.ts`](../../../../apps/platform/tests/production-env.spec.ts) pins listen importing Snow and refusing `DevelopmentKeylessPairingHandshakeProvider`.
