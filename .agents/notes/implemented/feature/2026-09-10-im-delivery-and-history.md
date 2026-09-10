# IM message history, cursor progress, and reliable outbound delivery

English | [中文](2026-09-10-im-delivery-and-history.zh.md)

- Area: `area/session`
- Kind: `kind/feature`
- Issue: #616 (part of #613)
- Parent: T1 IM domain configuration and routing (#615)

## Problem

Live IM account takeover requires reliable message history, cursor progression, deduplication, and outbound delivery guarantees. Specifically:
1. Inbound messages from external platforms or simulation must be deduplicated by external message ID per conversation scope without cross-scope leakage.
2. Inbound messages must be written to durable storage before advancing the progress cursor.
3. Message lifecycle stages (`received` != `submitted` != `sent`) must be distinguished to ensure restart recovery can resubmit unsubmitted messages without duplicating submitted ones.
4. Outbound delivery must distinguish pre-send failure (e.g. conversation disabled, account paused, or unconfigured target) from ambiguous external receipts (`result_unknown`). Unknown receipts must not be blindly retried.
5. Disabling a conversation must suppress pending AI outbound messages without batch flushing on re-enable.

## Solution

Implemented `ImDeliveryService` under `@deepseek-ai/dsh-im-core/delivery` with a dedicated storage domain (`im_delivery`):
- **Domain Tables**: `inbound_messages`, `outbound_messages`, `cursors`, and `dedup`.
- **Scope Identifier Encoding**: Colon-safe delimiter escaping (`%3A`, `%25`) ensuring strict isolation between real platform scopes (`real:${platform}:${accountId}:${conversationId}`) and simulation scopes (`sim:${instanceId}:${conversationId}`).
- **Deduplication**: Enforced via atomic record lookups on scoped external keys before persistence.
- **Write-First Inbound**: Writes inbound message record before updating cursor `lastReceivedSequenceNumber` and `unsubmittedCount`.
- **Stage Tracking**: `markSubmitted` updates message stage to `submitted` and advances `lastSubmittedSequenceNumber`.
- **Outbound Pre-Send & Ambiguity Guard**: Pre-send validates route enabled state and account pause for AI intent while allowing human owner manual send. Settle preserves `result_unknown` without auto-retry.
- **Cancel Pending AI**: `cancelPendingAiOutbound` aborts pending automated replies when a route is disabled, preventing batch flush on re-enable.
