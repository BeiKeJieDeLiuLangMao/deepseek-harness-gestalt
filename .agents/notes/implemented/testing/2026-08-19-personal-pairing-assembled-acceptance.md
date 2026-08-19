# Agent Note: Keyless Personal Pairing assembled acceptance

Status: implemented

English | [中文](2026-08-19-personal-pairing-assembled-acceptance.zh.md)

## Problem

Same-account Personal Pairing landed as product code, but #31 still lacked assembled acceptance through a real Loader composition. Trusted origin, GitHub OAuth, and a live Platform are unavailable, so a deployment-backed pairing cannot be the required evidence. A stub handshake also cannot prove that Desktop, Mobile, and Platform agree on one independent pairing key.

## Decision

Assembled #31 evidence is a locally runnable SHA-256 development derivation with no Noise handshake. `DevelopmentKeylessPairingHandshakeProvider` is the only handshake adapter in that path: every peer derives the same 256-bit key from the invitation secret by SHA-256, and production composition never imports or selects it. The Loader example and the Desktop assembled controller test boot a real `cordis.yml`, loopback HTTP Consumer, and the Host-owned Desktop and Mobile controllers. They prove Mobile Access starts disabled, a cross-account completion fails before a Device Principal exists, QR and the full one-time link are identical, both peers show the same authentication words, Desktop confirmation is required, the confirmed pairing holds a 32-byte independent key with only `companion-surface` authority, a second completion id on a settled challenge is `PAIRING_CHALLENGE_INVALID`, the identical completion id is idempotent, completion succeeds at `expiresAt - 1`, the controller rejects a deadline link locally, and `transport.completeChallenge` at `expiresAt` is `PAIRING_CHALLENGE_EXPIRED`.

Desktop placement evidence mounts the real Settings shell from `ui-settings-general` together with `ui-desktop` and renders each Settings section through the slot registry's registered `entry.component`. Under `zh-CN`, the nav labels are `通用设置` and `手机配对`; `AccountControl` is registered solely on `settings.section` id `mobile-pairing`; Mobile Access exists only on that section. This test does not mount conversation or workspace plugins.

## Alternatives considered

**Wait for a trusted origin and GitHub OAuth.** That remains the production acceptance path for #27, but it is not available to this ticket. Keyless Loader evidence is the local substitute, not a claim that product cryptography shipped.

**Keep the all-zero stub handshake.** Controllers and HTTP would stay green while Desktop and Mobile could disagree on key material. The explicit SHA-256 adapter makes the key agreement observable.

**Assert Mobile Access only on a standalone `AccountControl` render.** That misses the Settings-shell placement rule. The shell test occupies the real `settings.section` ledger, instantiates each registered section component, and switches nav rows.

## Consequences

#31 can close on keyless Loader and Settings-shell evidence without a development Platform. Deployment-owned origin, OAuth, two instances, and managed stores stay on #27. The keyless adapter remains unreviewed and must stay off the production path. Exact TTL bounds are pinned in both the provider unit test and the assembled controller path.
