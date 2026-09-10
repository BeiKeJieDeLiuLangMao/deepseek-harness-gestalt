---
description: "Wangwang / QianNiu IM adapter for DeepSeek Harness IM account takeover"
kind: "package"
---

# @deepseek-ai/dsh-im-wangwang

English | [中文](README.zh.md)

## Summary

The `@deepseek-ai/dsh-im-wangwang` package implements the Wangwang / QianNiu IM adapter for DeepSeek Harness. It provides admitted merchant directory management, per-request credential resolution via the CredentialProvider seam, native HMAC-SHA256 request signing, incremental event polling with whole-page progression against a durable channel cursor, outbox-verified sender identity, and reliable outbound delivery tracking.

## Features

- **Admitted Merchant Directory**: Pre-configured admitted merchant directory. Runtime guessing, auto-discovery, or UI manual entry of unauthorized merchant IDs is strictly disallowed.
- **Credential Reference Seam**: Access keys and secret keys are referenced via `CredentialRef` and resolved through `ctx.credentials` on every request. Credentials are never stored as instance state, kept in config, or printed in logs.
- **Native HMAC-SHA256 Cryptography**: Request authentication uses Node.js native `crypto.createHmac` for deterministic signing across `x-api-access-key`, `x-api-timestamp`, and `x-api-signature` headers.
- **Durable Cursor & Whole-Page Invariant**: The channel cursor lives in the adapter's own `im_wangwang` storage domain and survives host restarts and crashes. Concurrent pulls are serialized per merchant so the cursor read → fetch → advance cycle never interleaves; inbound pages are fully persisted in the delivery domain before the cursor advances, and backward movement is rejected with `CHANNEL_CURSOR_REGRESSION`.
- **Outbox-Verified Sender Classification**: Every settled DSH send writes a durable echo record (`sent_echoes`); inbound senderType claims are only trusted when they agree with that local evidence:
  - `1`: External customer (`external`)
  - `2`: Human native (`human_native`), or DSH manual send (`human_dsh`) when the messageId matches a settled `human_manual` echo
  - `3`: `ai_outbound` only when the messageId matches a settled DSH AI echo; unverified AI claims degrade to `unknown`
  - Conflicting / unrecognized claims are marked `unknown` without client self-attestation trust
- **Outbound Ambiguity Handling**: Differentiates pre-send failures (disabled routes, paused accounts — owned by `ImDeliveryService.registerOutbound`) from ambiguous responses (`result_unknown` via the structured `WangwangAmbiguousError` on network failure, 408, 429, or 5xx), preventing blind retries.

## Usage

Register in `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-im-wangwang'
  config:
    endpoint: 'https://openapi.fliggy.com'
    admittedMerchants:
      - merchantId: 'merchant_001'
        accountId: 'acc_ww_001'
        displayName: 'Official Store'
        accessKeyRef: 'WANGWANG_ACCESS_KEY'
        secretKeyRef: 'WANGWANG_SECRET_KEY'
```
