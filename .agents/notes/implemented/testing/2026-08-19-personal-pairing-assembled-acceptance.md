# Agent Note: Keyless Personal Pairing assembled acceptance

Status: implemented

English | [中文](2026-08-19-personal-pairing-assembled-acceptance.zh.md)

## Problem

Same-account Personal Pairing landed as product code, but #31 still lacked assembled acceptance through a real Loader composition. Trusted origin, GitHub OAuth, and a live Platform are unavailable, so a deployment-backed pairing cannot be the required evidence. A stub handshake also cannot prove that Desktop, Mobile, and Platform agree on one independent pairing key.

## Decision

Assembled #31 evidence is keyless and locally runnable. `DevelopmentKeylessPairingHandshakeProvider` is the only handshake adapter in that path: every peer derives the same 256-bit key from the invitation secret by SHA-256, and production composition never selects it. The Loader example and `remote-access-http` assembled controller test boot a real `cordis.yml`, loopback HTTP Consumer, and the Host-owned Desktop and Mobile controllers. They prove Mobile Access starts disabled, a cross-account completion fails before a Device Principal exists, QR and the full one-time link are identical, both peers show the same authentication words, Desktop confirmation is required, the confirmed pairing holds a 32-byte independent key with only `companion-surface` authority, a second completion id on a settled challenge is `PAIRING_CHALLENGE_INVALID`, the identical completion id is idempotent, and completion succeeds at `expiresAt - 1` and fails at `expiresAt`.

Desktop placement evidence mounts the real Settings shell from `ui-settings-general` together with `ui-desktop`. Under `zh-CN`, the nav labels are `通用设置` and `手机配对`; Mobile Access exists only on `手机配对`; `conversation`, `conversation.session`, `conversation.composer`, and `sidebar.workspaces` stay empty.

## Alternatives considered

**Wait for a trusted origin and GitHub OAuth.** That remains the production acceptance path for #27, but it is not available to this ticket. Keyless Loader evidence is the local substitute, not a claim that product cryptography shipped.

**Keep the all-zero stub handshake.** Controllers and HTTP would stay green while Desktop and Mobile could disagree on key material. The explicit SHA-256 adapter makes the key agreement observable.

**Assert Mobile Access only on a standalone `AccountControl` render.** That misses the Settings-shell placement rule. The shell test occupies the real `settings.section` ledger and switches nav rows.

## Consequences

#31 can close on keyless Loader and Settings-shell evidence without a development Platform. Deployment-owned origin, OAuth, two instances, and managed stores stay on #27. The keyless adapter remains unreviewed and must stay off the production path. Exact TTL bounds are pinned in both the provider unit test and the assembled controller path.
