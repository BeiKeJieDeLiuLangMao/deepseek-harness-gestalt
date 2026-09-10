---
description: "Wangwang / QianNiu IM adapter for DeepSeek Harness IM account takeover"
kind: "package"
---

# @deepseek-ai/dsh-im-wangwang

English | [中文](README.zh.md)

## Summary

The `@deepseek-ai/dsh-im-wangwang` package implements the Wangwang / QianNiu IM adapter for DeepSeek Harness. It provides admitted merchant directory management, credential resolution via the CredentialProvider seam, native HMAC-SHA256 request signing, incremental event polling with whole-page progression, progress cursor regression guards, and reliable outbound delivery tracking.

## Features

- **Admitted Merchant Directory**: Pre-configured admitted merchant directory. Runtime guessing, auto-discovery, or UI manual entry of unauthorized merchant IDs is strictly disallowed.
- **Credential Reference Seam**: Access keys and secret keys are referenced via `CredentialRef` through `ctx.credentials`. No plain-text secrets are stored in config or printed in logs.
- **Native HMAC-SHA256 Cryptography**: Request authentication uses Node.js native `crypto.createHmac` for deterministic signing across `x-api-access-key`, `x-api-timestamp`, and `x-api-signature` headers.
- **Whole-Page Progress & Cursor Invariant**: Inbound event pages are fully processed and persisted in the delivery domain before advancing the channel cursor. Backward cursor movement is safely rejected with `CHANNEL_CURSOR_REGRESSION`.
- **Sender Classification**:
  - `1`: External customer (`external`)
  - `2`: Human native (`human_native`), or DSH manual send (`human_dsh`) when matching registered outbox echo
  - `3`: AI upstream reply (`ai_outbound`) with producer identity evidence
  - Conflicting / unrecognized claims are marked `unknown` without client self-attestation trust
- **Outbound Ambiguity Handling**: Differentiates pre-send failures (disabled routes, paused accounts) from ambiguous responses (`result_unknown` on network timeout or 5xx), preventing blind retries.

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
