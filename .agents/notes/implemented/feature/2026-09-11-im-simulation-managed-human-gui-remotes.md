# Agent Note: IM simulation managed-human GUI remotes

Status: implemented

English | [中文](2026-09-11-im-simulation-managed-human-gui-remotes.zh.md)

## Problem

The tested-agent role already inspects the running simulation stream, but its composer still queued `registerManualOutbound`. That path is a human_dsh outbound, not the managed-account inbound `im_sim_send_as_managed_human` uses.

## Decision

`ImSimulationService` exposes GUI Remote `injectManagedHumanMessage`. The adapter takes `{ instanceId, text, humanNick? }`, Host fills the external message id, and the wire returns a text-only inbound view with `senderClassification: human_dsh`. Tested-agent role with a running instance sends as self through that remote. Simulated-user role keeps Send as member. Real-scope manual send still uses `registerManualOutbound`.

## Alternatives considered

**Keep tested-agent on `registerManualOutbound`.** Rejected: that queues outbound, so the stream shows `本人 · DSH / 发送中` instead of a received managed-human inbound.

**Drive managed-human inject only through `im_sim_send_as_managed_human`.** Rejected because proving it in the Sidebar would require an authorized model round.

## Consequences

The Sidebar can inject a local managed-human inbound into a running simulation instance without live DingTalk, Wangwang, or a model round. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.
