# Agent Note: IM 模拟结束 GUI remotes

Status: implemented

[English](2026-09-11-im-simulation-stop-gui-remotes.md) | 中文

## Problem

Sidebar 已能创建 Host 模拟实例并注入成员入站，但结束实例仍需 Agent 工具调用。GUI 验证跑完后实例会一直 `running`。

## Decision

`ImSimulationService.stopInstance` 作为 GUI Remote。模拟用户角色在运行中的实例上显示「结束模拟实例」；Host 调用为终态。结束后 `selectedStreamScope` 回退到真实 GUI 作用域，「创建模拟实例」重新出现。

## Alternatives considered

**只通过 `im_sim_stop` 结束实例。** 否决：要在 Sidebar 证明终态就得走已授权的模型 round。

**结束后允许恢复。** 否决：域上 stop 已是终态。

## Consequences

Sidebar 可以结束本地模拟实例，无需真实钉钉、旺旺或模型 round。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
