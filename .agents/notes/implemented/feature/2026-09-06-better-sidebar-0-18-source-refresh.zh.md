# Agent Note：Better Sidebar 源码更新与正式 Side Chat

Status: implemented

[English](2026-09-06-better-sidebar-0-18-source-refresh.md) | 中文

## Problem

Better Sidebar main 提供文件树、编辑器、差异与终端行为，Gestalt 持有正式 Conversation 渲染器与 Desktop 窗口框架。整目录覆盖会恢复上游 Side Chat 渲染器并丢失这些产品义务。

## Decision

main 固定为 `d88dcfc3a50b43d4fc8baef961a8cc75809f41a6`（版本标记 `0.18.1`）。仅导入 `dsh.plugin.json`、`src` 与 `tsdown.config.ts`；仓库清单、测试与文档继续由本仓持有。重放 [LOCAL-MODIFICATIONS.md](../../../../packages/client/ui-better-sidebar/LOCAL-MODIFICATIONS.md) 的每条记录。

保留 Side Chat 临时身份、正式 `conversation` 挂载、首条提示发布、模型与权限准入、持久化恢复和串行关闭。继承计数仅覆盖捕获的父历史前缀，追加的 child descriptor 仍是首条自有事件。上游 seed 标记改动不能把该计数替换为完整 seed 长度。Desktop 弹层菜单、窗口拖拽区域与手机 tab 状态标记继续作为产品适配。

## Alternatives considered

**整目录覆盖。** 拒绝，因为它会恢复平行的轨迹与输入框，并丢失准入和窗口框架的责任归属。

**跳过所有带本地改动的文件。** 拒绝，因为这也会遗漏独立的文件树、预览、终端和菜单修复。按 hunk 合并兼容改动，并保留精确源码记录。

## Consequences

快照采纳上游文件树重命名/删除、预览阅读与脱敏、差异展开、带引号的终端配置和正则终端等待。本地测试集持有源码更新和产品适配的回归证据。包级检查不代表组装后的 Web 或 Electron 验收。

## Verification

核对精确 pin 与允许导入路径，运行 Sidebar 测试集和构建，并通过已有测试验证正式 Side Chat 和 Desktop 行为。新增回归覆盖根目录与覆盖拒绝、符号链接删除、终端参数分组、真实 PTY 正则等待和预览脱敏。
