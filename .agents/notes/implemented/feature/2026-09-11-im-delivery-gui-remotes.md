# Agent Note: IM delivery GUI remotes

Status: implemented

English | [中文](2026-09-11-im-delivery-gui-remotes.zh.md)

## Problem

Accounts, routes, and simulation targets already persist through `imConfig` remotes, but the Sidebar conversation stream still mutated local rows. Manual send therefore claimed `sent` without a Host outbound record, and reload dropped the stream.

## Decision

`ImDeliveryService` extends `TypertRemoteService` and exposes GUI adapters `queryHistory`, `listOutbound`, `registerManualOutbound`, and `cancelPendingAiOutbound`. Those adapters return text-only views because inbound/outbound records carry unconstrained `unknown` payloads that cannot ride the Typert wire. GUI remotes take a `{ scope }` object and Host encodes the scope id, because a client value import of `encodeScopeId` is not an inline-safe wire layer. `packages/api/remotes` already mounts the generated `@deepseek-ai/dsh-im-core/remote` contribution, which now includes the `imDelivery` namespace. `ui-im` injects `remote.imDelivery`, refreshes the stream from history plus outbound, and queues GUI manual send as `human_manual`. The conversation strip Enable/Disable affordance writes `updateRouteRule({ enabled })` and, on disable, cancels pending AI outbound without flushing adapters. In-process `registerOutbound` still does not flush adapters. Config remotes remain in [IM config GUI remotes](2026-09-11-im-config-gui-remotes.md).

## Alternatives considered

**Keep the conversation stream local after config remotes.** Rejected because Settings and workspace cards would persist while the Sidebar lied about delivery.

**Expose `settleOutbound` and adapter flush on the same GUI Remote.** Rejected: live outbound stays a separately authorized lane; the GUI may only queue.

**Put the full inbound/outbound records on the wire.** Rejected because Typert forbids unconstrained `unknown` payloads.

**Pass a bare `scopeId` positional argument to `listOutbound`.** Rejected because Typert Remote payloads must be one plain object.

**Let the GUI encode `scopeId` with `encodeScopeId`.** Rejected because `@deepseek-ai/dsh-im-core/client` is not an inline-safe wire layer for client bundles.

## Consequences

The Sidebar stream lists Host inbound and queued outbound when the Client assembly is mounted. Manual send creates a pending outbound record and never claims live DingTalk or Wangwang delivery. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.
