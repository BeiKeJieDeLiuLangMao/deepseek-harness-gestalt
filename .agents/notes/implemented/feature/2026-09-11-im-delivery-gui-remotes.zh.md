# Agent Note: IM delivery GUI remotes

Status: implemented

[English](2026-09-11-im-delivery-gui-remotes.md) | 中文

## Problem

账号、路由与模拟目标已通过 `imConfig` remotes 持久化，但 Sidebar 对话流仍在改本地行。因此人工发送会在没有 Host 出站记录的情况下声称 `sent`，刷新也会丢掉对话流。

## Decision

`ImDeliveryService` 继承 `TypertRemoteService`，暴露 GUI 适配器 `queryHistory`、`listOutbound`、`registerManualOutbound` 和 `cancelPendingAiOutbound`。这些适配器只返回文本视图，因为入站/出站记录带有不能上 Typert 线的 unconstrained `unknown` payload。GUI remotes 收 `{ scope }` 对象，由 Host 编码 scope id，因为客户端不能值导入 `encodeScopeId`。`packages/api/remotes` 已挂载生成的 `@deepseek-ai/dsh-im-core/remote` contribution，现在包含 `imDelivery` 命名空间。`ui-im` 注入 `remote.imDelivery` 和 `uiWorkspace`，用历史加出站刷新对话流，并把 GUI 人工发送按 `human_manual` 入队。条上的启用/停用写入 `updateRouteRule({ enabled })`，停用时取消 pending AI 出站，不 flush 适配器。模拟用户与被测 Agent 按钮经 `uiWorkspace.openWorkspace` 打开绑定工作区 Session。进程内 `registerOutbound` 仍不 flush 适配器。配置 remotes 仍见 [IM config GUI remotes](2026-09-11-im-config-gui-remotes.zh.md)。

## Alternatives considered

**配置 remotes 落地后仍把对话流留在本地。** 否决，因为 Settings 与工作区卡片会持久化，Sidebar 却对投递撒谎。

**同一 GUI Remote 再暴露 `settleOutbound` 和适配器 flush。** 否决：真实出站仍是另行授权的车道；GUI 只能入队。

**把完整入站/出站记录上线。** 否决，因为 Typert 禁止 unconstrained `unknown` payload。

**给 `listOutbound` 传裸 `scopeId` 位置参数。** 否决，因为 Typert Remote payload 必须是一个普通对象。

**让 GUI 用 `encodeScopeId` 编码 `scopeId`。** 否决，因为 `@deepseek-ai/dsh-im-core/client` 不是客户端 bundle 的 inline-safe 线上层。

## Consequences

当 Client assembly 已挂载时，Sidebar 流列出 Host 入站与已入队出站。人工发送会创建 pending 出站记录，从不声称真实钉钉或旺旺投递。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需另行授权。
