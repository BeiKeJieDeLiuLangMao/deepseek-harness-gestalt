# Wangwang / QianNiu IM adapter for account takeover

English | [中文](2026-09-10-im-wangwang-adapter.zh.md)

- Area: `area/session`
- Kind: `kind/feature`
- Issue: #618 (part of #613)
- Parent: T1 IM domain configuration and routing (#615) & T2 IM delivery and history (#616)

## Problem

Enabling DeepSeek Harness workspace agents to take over Wangwang / QianNiu accounts requires a dedicated adapter connecting to the Wangwang OpenAPI without coupling to business logic or exposing credentials:
1. The platform provides no `whoami` endpoint, making runtime guessing or UI input of merchant IDs dangerous.
2. Access keys and secret keys must remain strictly behind the `CredentialProvider` seam via `CredentialRef` without leaking into configuration, logs, or diagnostic dumps.
3. Message history polling must adhere to whole-page atomic delivery before cursor advancement, and cursor regressions or out-of-order sequence arrivals must be safely rejected.
4. Outbound sending must differentiate pre-send validation failures (account paused, route unconfigured or disabled) from ambiguous responses (`result_unknown` on network timeout or 5xx). Ambiguous transmissions must never be blindly retried.
5. Inbound sender types must be rigorously classified into `external`, `human_native`, `human_dsh` (matched outbox echo), `ai_outbound` (upstream evidence facts), and `unknown` without trusting untyped client assertions.

## Solution

Implemented `@deepseek-ai/dsh-im-wangwang` (`packages/im/im-wangwang`):
- **Admitted Merchant Directory**: Pre-configured `admittedMerchants` list mapping `merchantId` to Harness `accountId` and `CredentialRef`. Dynamic discovery or runtime guessing is refused.
- **Seam Credential Resolution**: AccessKey and SecretKey are resolved through `ctx.credentials.resolve(ref)` on each request and never stored in memory or logged.
- **Native HMAC-SHA256 Signing**: Built-in `node:crypto` generates deterministic signatures across method, path, canonical sorted query parameters, and millisecond timestamps under `x-api-*` headers.
- **Whole-Page Processing & Cursor Guard**: Polled pages are persisted to `ImDeliveryService` before updating the local cursor; regressions trigger `CHANNEL_CURSOR_REGRESSION`.
- **Sender Fact Resolution**: Categorizes sender types based on structural facts (senderType 1/2/3, producerId facts, and internal outbox matching) rather than trusting client claims.
- **Outbound Status Settlement**: Classifies pre-send blocks (`pre_send_failed`), successful receipts (`sent`), and ambiguous outcomes (`result_unknown`).
