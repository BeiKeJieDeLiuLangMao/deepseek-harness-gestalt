# Agent Note: IM takeover assembled acceptance

Status: implemented

[English](2026-09-10-im-assembled-acceptance.md) | 中文

## Problem

T1–T7 各自证明一条接缝。装配验收仍须把已配置账号、路由、夹具适配器、模拟用户、被测 Agent、停止隔离和 Sidebar 呈现放在同一条路径上，且不得把 mock 或 dry-run 当作真实端到端证据。

## Decision

`packages/im/im-core/tests/assembled-acceptance.spec.ts` 用夹具钉钉适配器启动真实的 IM 配置、投递、执行与模拟服务。它证明路由命中、@ 触发、`external` / `human_dsh` / `ai_outbound` 分类、不调用适配器的模拟出站、只打桩的夹具真实出站，以及停止后第二个实例仍可运行。`packages/client/ui-im/src/client/presentation.ts` 把这些记录映射为发送者徽标与投递状态；`result_unknown` 不是成功。`IM_LIVE_LANE_BEHAVIORS` 点名真实钉钉登录、真实旺旺读取、真实出站、真实模型调用和原生 Desktop GUI computer-use。

## Alternatives considered

**用真实模型录制 headless ACP snapshot。** 否决，因为真实模型调用需要另行授权；无密钥域组合已能证明路由、触发、分类、路径对等和停止。

**把原生 Desktop GUI computer-use 当作本票据证据。** 否决，因为该车道仍未配置；报告点名它，而不是用 mock 截图顶替。

## Consequences

装配验收是无密钥的。真实读账号、真实出站、真实模型调用和原生 Desktop GUI computer-use 仍需另行授权。审批仍只走原生审批界面。
