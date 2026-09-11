# Agent Note: IM 被测 Agent 模拟流

Status: implemented

[English](2026-09-11-im-simulation-tested-stream.md) | 中文

## Problem

Sidebar 模拟用户角色已能创建实例并注入成员入站，但被测 Agent 角色仍读真实 `gui-all` 作用域。切换角色会把模拟流藏起来。

## Decision

`selectedStreamScope` 把模拟用户和被测 Agent 都绑到运行中的实例。模拟用户匹配 `workspaceId`；被测 Agent 匹配覆盖真实 GUI 作用域的接管规则的 `testedWorkspaceId`。被测角色的手动发送仍走该 sim 作用域，不 flush 适配器。

## Alternatives considered

**被测 Agent 继续读真实 GUI 作用域。** 否决：接管验证要看的产品流是模拟会话，不是空的真实 `gui-all`。

**给被测 Agent 单独的实例 id。** 不必：一份冻结实例已经同时记下两个工作区。

## Consequences

两个对话角色可以查看同一条本地模拟流，无需真实钉钉、旺旺或模型 round。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
