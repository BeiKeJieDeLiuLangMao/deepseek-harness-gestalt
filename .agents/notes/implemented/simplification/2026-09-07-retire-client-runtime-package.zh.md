# Agent Note: Retire the client runtime package

Status: implemented

[English](2026-09-07-retire-client-runtime-package.md) | 中文

## Problem

临时的 `@deepseek-ai/dsh-client-runtime` 包在 Client Session、Workspace、conversation、slot 和 lineage 职责迁移到专属包之后仍重复表达这些所有权。继续保留这个空迁移边界，会留下过期 TypeScript 引用、生成 alias、包元数据，以及针对已不存在约定的测试。

## Decision

工作区不包含 `packages/client/runtime`。Session 与 Workspace 行为属于 API controller，conversation 组装属于 `ui-conversation`，slot 渲染属于 `ui-renderer`，subagent lineage 属于当前 presentation owner。产品包直接引用这些 owner。

工作区图不包含该包的 TypeScript reference、生成 alias 与 catalog、lockfile importer、compiler-face 登记和 invariant 文档。

旧 `PendingWait.respond()` response envelope 及其 `rpcId` 回填已不存在，因为当前 interaction 协议通过 `clientId` 与 `eventId` 结算 `$events`。

## Testing

Session Controller 测试覆盖 admission 与 provisional identity。Workspace Controller 测试覆盖 mutation、排序、archive 状态与目录选择。`ui-workspace` 与 `ui-subagent` 测试覆盖 lineage 计数。Desktop Companion product 与 interaction 测试先生成 Typert Remote 产物，再覆盖通过 `clientId` 与 `eventId` 的 `$events` 相关性。Workbench 测试把 Browser Workspace 的公开 `/client` 入口直接解析到 browser-safe source。

包管理器 frozen-lock 检查、生成 path 与 catalog 检查、compiler-face 测试和 consumer suite 验证仓库图不再依赖该包。剩余 Workbench external-policy 违规需要由其 owner 迁移，不能作为恢复该包的依据。

## Alternatives considered

**保留 compatibility barrel。** 这会继续保留生产 consumer 不使用的 import 与测试，掩盖当前 owner 的缺失依赖，并允许 `PendingWait.respond()` 等已删除约定重新出现。

**原样移动全部旧测试。** 部分测试验证的是已删除的 `SessionRuntime` 实现或过期 wire 字段，而不是当前行为。当前 owner 测试保留相关行为，无需重建该包。

**只删除源码目录。** 若保留 alias、project reference、catalog、lock entry 与 invariant 文档，仓库图仍会把该包视为存在，clean-tree 检查也会得出相互矛盾的结论。

## Consequences

Client graph 减少一个包，且不再提供 `@deepseek-ai/dsh-client-runtime` compatibility route。Consumer 必须导入当前 owner 或使用其 Cordis service。历史 Agent Note 仍可作为历史记录提及已退役包，但活动的生成 inventory 与 compiler graph 不再包含它。

Source-plane 包编译仍可能暴露当前 owner 中独立的 browser-safe type import 问题；退役不构成向 Client program 添加 Node types 或恢复已删除 runtime 包的理由。
