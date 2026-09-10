# Agent Note: IM takeover assembled acceptance

Status: implemented

English | [中文](2026-09-10-im-assembled-acceptance.zh.md)

## Problem

T1–T7 each prove a seam. Assembled acceptance still has to show one configured account, one route, a fixture adapter, a simulated user, a tested agent, stop isolation, and Sidebar presentation together, without treating mock or dry-run evidence as live end-to-end.

## Decision

`packages/im/im-core/tests/assembled-acceptance.spec.ts` boots the real IM config, delivery, execution, and simulation services with a fixture DingTalk adapter. It proves route matching, mention trigger, `external` / `human_dsh` / `ai_outbound` classification, simulated outbound that never calls adapters, fixture real outbound that calls only the stub, and stop that leaves a second instance running. `packages/client/ui-im/src/client/presentation.ts` maps those records onto sender badges and delivery states; `result_unknown` is not success. `IM_LIVE_LANE_BEHAVIORS` names live DingTalk login, live Wangwang reads, live outbound, real model calls, and native Desktop GUI computer-use.

## Alternatives considered

**Record a headless ACP snapshot with a real model.** Rejected because real model calls require separate authorization; a keyless domain composition already proves routing, triggers, classification, path parity, and stop.

**Claim native Desktop GUI computer-use as this ticket's evidence.** Rejected because that lane is still unconfigured; the report names it instead of substituting a mock screenshot.

## Consequences

Assembled acceptance is keyless. Live account reads, live outbound, real model calls, and native Desktop GUI computer-use remain separately authorized. Native approval stays the only approval surface.
