# Agent Note: IM 模拟成员 GUI remotes

Status: implemented

[English](2026-09-11-im-simulation-member-gui-remotes.md) | 中文

## Problem

Sidebar 已能创建 Host 模拟实例并排队 human_dsh 出站，但模拟入站仍需 Agent 工具调用。没有模型 round，对话流就看不到群成员消息。

## Decision

`ImSimulationService` 暴露 GUI Remote `injectMemberMessage`。适配器收 `{ instanceId, memberId, text, memberNick? }`，Host 填外部消息 id，线上返回纯文本入站视图。模拟用户角色在运行中的实例上经该 Remote 以成员发送，再刷新 `imDelivery` 历史。被测 Agent 角色仍用 human_dsh 手动发送。

## Alternatives considered

**只通过 `im_sim_send_as_member` 注入成员消息。** 否决：要在 Sidebar 证明入站就得走已授权的模型 round。

**把带 unconstrained payload 的完整入站记录上线。** 不必：GUI 历史已裁成纯文本视图。

**成员注入复用 human_dsh 输入框。** 否决：那条路径排队的是出站，不是模拟入站。

## Consequences

Sidebar 可以向运行中的模拟实例注入本地成员入站，无需真实钉钉、旺旺或模型 round。模拟出站仍本地结算。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
