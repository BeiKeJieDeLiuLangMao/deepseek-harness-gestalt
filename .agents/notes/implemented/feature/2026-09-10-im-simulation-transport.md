# Agent Note: IM simulation transport and workspace tool gating

Status: implemented

English | [中文](2026-09-10-im-simulation-transport.zh.md)

## Problem

Account takeover needs a local simulation path that uses the same inbound records, history query, and `im_send_message` tool as live DingTalk and Wangwang, without addressing arbitrary accounts or sending to a real contact. A simulated user workspace must select one configured takeover target before simulation tools appear. Each instance must keep the target chosen at creation, isolate concurrent sessions, treat explicit stop as terminal, import JSONL only as queryable background, and keep account-level pause from blocking simulation delivery.

## Decision

`ImSimulationService` mounts at `ctx.imSimulation` under `@deepseek-ai/dsh-im-core/simulation`. `registerSimulationTools(ctx, workspaceId)` registers `im_sim_create`, `im_sim_stop`, `im_sim_send_as_member`, and `im_sim_send_as_managed_human` only after `imConfig.getSimulationConfig` returns a target; an unconfigured workspace gets an empty disposer. `createInstance` snapshots account, conversation kind, conversation id, and the matching route's tested workspace. Later `setSimulationConfig` changes do not rewrite that snapshot. Member injection uses `external`; managed-account human injection uses `human_dsh`. JSONL import writes inbound records and immediately `markSubmitted`, so `admitInbound` does not steer them. `im_send_message` on a `sim:` scope requires a running instance, settles through `handleSimOutbound`, and echoes `ai_outbound` into the same scope. DingTalk and Wangwang adapters are never called. Stopped or missing instances reject send, inject, recreate-same-id, and admission.

## Alternatives considered

**Add a simulation-only reply tool beside `im_send_message`.** Rejected because a configuration could pass simulation while failing the live outbound path. The tested agent keeps one outbound tool; instance context selects the simulation adapter.

**Retarget running instances when workspace simulation config changes.** Rejected because an in-flight test would silently address a different account or conversation.

**Keep simulation outbound pending until a later transport ticket.** Rejected because T6 owns local bidirectional delivery; pending sim send would look successful without a local receipt.

## Consequences

Simulation tools stay gated behind a configured target. Concurrent instances do not share history. Stop is terminal. JSONL is background query data. Account pause still allows simulation inject and local outbound settle. Live adapters remain unused on the sim path.

Focused tests in `packages/im/im-core/tests/simulation/transport.spec.ts` cover tool absence, frozen targets, isolation, stop, JSONL non-trigger, adapter non-use, pause, and sender classifications. The existing keyless Loader composition now also requires `ctx.get('imSimulation')`.
