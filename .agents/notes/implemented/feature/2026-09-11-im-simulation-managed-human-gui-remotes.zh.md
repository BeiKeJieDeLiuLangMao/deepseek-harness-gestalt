# Agent Note: IM 模拟托管本人 GUI remotes

Status: implemented

[English](2026-09-11-im-simulation-managed-human-gui-remotes.md) | 中文

## Problem

被测 Agent 角色已能查看运行中的模拟流，但输入框仍走 `registerManualOutbound`。那条路径是 human_dsh 出站，不是 `im_sim_send_as_managed_human` 用的托管账号入站。

## Decision

`ImSimulationService` 暴露 GUI Remote `injectManagedHumanMessage`。适配器收 `{ instanceId, text, humanNick? }`，Host 填外部消息 id，线上返回 `senderClassification: human_dsh` 的纯文本入站视图。被测角色在运行中的实例上经该 Remote 以本人发送。模拟用户角色仍用「以成员发送」。真实作用域的手动发送仍走 `registerManualOutbound`。

## Alternatives considered

**被测 Agent 继续走 `registerManualOutbound`。** 否决：那是出站排队，流里会显示「本人 · DSH / 发送中」，不是已接收的托管本人入站。

**只通过 `im_sim_send_as_managed_human` 注入。** 否决：要在 Sidebar 证明就得走已授权的模型 round。

## Consequences

Sidebar 可以向运行中的模拟实例注入本地托管本人入站，无需真实钉钉、旺旺或模型 round。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
