# Agent Note: Wangwang / QianNiu IM adapter for account takeover

Status: implemented

English | [中文](2026-09-10-im-wangwang-adapter.zh.md)

## Problem

Enabling DeepSeek Harness workspace agents to take over Wangwang / QianNiu accounts (#618, part of #613; builds on #615 IM configuration and #616 delivery/history) requires a dedicated adapter connecting to the Wangwang OpenAPI without coupling to business logic or exposing credentials:

1. The platform provides no `whoami` endpoint, making runtime guessing or UI input of merchant IDs dangerous.
2. Access keys and secret keys must remain strictly behind the `CredentialProvider` seam via `CredentialRef` without leaking into configuration, logs, or instance state.
3. Message polling must survive host restarts without re-reading history, adhere to whole-page atomic delivery before cursor advancement, and stay correct under concurrent pulls.
4. Outbound sending must differentiate pre-send validation failures (account paused, route unconfigured or disabled) from ambiguous responses (`result_unknown` on network failure or 5xx). Ambiguous transmissions must never be blindly retried.
5. Inbound sender types must be classified into `external`, `human_native`, `human_dsh`, `ai_outbound`, and `unknown` from verifiable local evidence, never from upstream self-attestation — otherwise the agent would re-ingest its own outbound echoes and loop.

## Decision

Ship `@deepseek-ai/dsh-im-wangwang` (`packages/im/im-wangwang`):

- **Admitted merchant directory**: a pre-configured `admittedMerchants` list maps `merchantId` to Harness `accountId` and `CredentialRef`; dynamic discovery is refused.
- **Per-request credential resolution**: AccessKey/SecretKey resolve through `ctx.credentials.resolve(ref)` on every call; the OpenAPI client takes credentials per request and holds no credential state.
- **Native HMAC-SHA256 signing**: `node:crypto` signs method, path, canonical sorted query, and millisecond timestamp under `x-api-*` headers.
- **Durable cursor with serialized pulls**: the channel cursor lives in the adapter's own `im_wangwang` storage domain (`channel_cursors` table) and survives restarts; a per-merchant mutex serializes `pullAndDeliver` so the cursor read → fetch → advance cycle never interleaves; pages persist to `ImDeliveryService` before the cursor advances; regressions throw `CHANNEL_CURSOR_REGRESSION`.
- **Outbox-verified sender identity**: every send that settles `sent` writes a durable `sent_echoes` record (merchantId::messageId → requestId + intent). Inbound senderType 2/3 claims classify against that evidence: `human_dsh` / `ai_outbound` only on a matching settled echo, unverified or conflicting claims degrade to `unknown`. The echo index lives adapter-side because `ImDeliveryService` exposes no outbound lookup by external messageId and its surface is owned by #616.
- **Structured ambiguity**: network failures and 408/429/5xx raise `WangwangAmbiguousError` (carrying `httpStatus`/`rawDetails`); the adapter settles those as `result_unknown`, other failures as `confirmed_failed`.
- **Single-owner pre-send validation**: `ImDeliveryService.registerOutbound` owns paused-account and route checks; the adapter maps its `pre_send_failed` record rather than duplicating validation.

## Alternatives considered

- **Trust upstream senderType/producerId claims** — rejected: self-attestation lets an own-send echo re-enter the agent loop as a customer or AI message.
- **In-memory cursor map** — rejected: a host restart replays or skips history; the durable domain table is the only restart-safe home.
- **Adapter-side duplicate pre-send checks** — rejected: two owners for one validation drift; the delivery service already persists the failure reason.
- **`Reflect.set(err, 'isAmbiguous')` on plain Errors** — rejected: an invisible tag no type system sees; a dedicated error class carries the ambiguity contract.
- **Extend `ImDeliveryService` with an outbound-by-externalMessageId lookup** — rejected within this PR's scope: the delivery surface belongs to #616, and the adapter is the only Wangwang send producer, so its own durable echo index is sufficient evidence.

## Consequences

The adapter owns one storage domain (`im_wangwang`, version 1) with two tables; its records are validated at the durable boundary. Tests boot the service exclusively through the public cordis plugin lifecycle (`ctx.plugin`), with test fetch bound through a subclass constructor seam — protected lifecycle symbols are never invoked directly. The package is wired into the Host tsconfig project graph and holds 100% statement/branch coverage under the unit gate. Crash replay between message persistence and cursor advance re-pulls the page and is deduplicated by `externalMessageId` in the delivery domain.
