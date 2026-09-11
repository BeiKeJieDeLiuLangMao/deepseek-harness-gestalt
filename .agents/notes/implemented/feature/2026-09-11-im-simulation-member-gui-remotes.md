# Agent Note: IM simulation member GUI remotes

Status: implemented

English | [中文](2026-09-11-im-simulation-member-gui-remotes.zh.md)

## Problem

The Sidebar could create a Host simulation instance and queue a human_dsh outbound, but simulated inbound still required an Agent tool call. Without a model round, the conversation stream could not show a group-member message.

## Decision

`ImSimulationService` exposes GUI Remote `injectMemberMessage`. The adapter takes `{ instanceId, memberId, text, memberNick? }`, Host fills the external message id, and the wire returns a text-only inbound view. Simulated-user role with a running instance sends as a member through that remote and refreshes `imDelivery` history. Tested-agent role keeps the manual human_dsh composer.

## Alternatives considered

**Drive member inject only through `im_sim_send_as_member`.** Rejected because proving inbound in the Sidebar would require an authorized model round.

**Put full inbound records with unconstrained payloads on the wire.** Unnecessary: GUI history already strips to text-only views.

**Reuse the human_dsh composer for member inject.** Rejected: that path queues outbound, not simulated inbound.

## Consequences

The Sidebar can inject a local member inbound into a running simulation instance without live DingTalk, Wangwang, or a model round. Simulated outbound still settles locally. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.
