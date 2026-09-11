# Agent Note: IM 模拟 GUI remotes

Status: implemented

[English](2026-09-11-im-simulation-gui-remotes.md) | 中文

## Problem

模拟工具已挂到配了目标的工作区 Agent 上，但 Sidebar 对话标签仍读真实 `gui-all` 作用域。创建实例需要模型工具调用，模拟入站也不会出现在 GUI 流里。

## Decision

`ImSimulationService` 继承 `TypertRemoteService`，暴露 GUI 适配器 `listInstances` 和 `createInstance`。GUI `createInstance` 收 `{ workspaceId }`；Host 用工作区目标填会话 id（全量目标时为 `gui-all`）。`ui-im` 注入 `remote.imSimulation`。模拟用户角色经 `imDelivery` 历史和出站读取运行中的实例；「创建模拟实例」走 Host 创建，不 flush 适配器。被测 Agent 角色仍读真实 GUI 作用域。

## Alternatives considered

**只通过 `im_sim_create` 创建实例。** 否决：要证明对话流就得走已授权的模型 round。

**把带 unconstrained payload 的完整实例记录上线。** 不必：实例记录已是 Typert 安全的 branded 字段。

**工具挂载后 Sidebar 仍读真实 `gui-all`。** 否决：模拟入站会继续不可见。

## Consequences

Sidebar 可以创建本地模拟实例并列出其 Host 流，无需真实钉钉、旺旺或模型 round。模拟出站仍本地结算。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
