# Agent Note：Better Sidebar 持久化 Session 读取

Status: implemented

[English](2026-09-08-better-sidebar-session-persistence-read-handles.md) | 中文

## Problem

Better Sidebar 冷路由调用了 `sessionPersistence.inspect()`，而基于句柄的 Session Persistence 服务没有该方法。本地结构化服务镜像声明了这个方法，因此包级类型检查接受了会在运行时失败的调用。Side Chat 冷恢复在 Agent resume 报告写入归属前返回 `persistence.inspect is not a function`，冷工作目录与 Changes 事件读取中也留有相同的过期调用。

## Decision

`SidebarSessionPersistenceService` 是来自 Service Definition 包的 `Pick<SessionPersistence, 'list' | 'open' | 'stat'>`，并遵循[基于句柄的 persistence 决策](../architecture/2026-08-27-handle-based-session-persistence.zh.md)。本包把该能力声明为 peer dependency 与 development dependency，其 TypeScript 项目引用 Service Definition 项目。后续方法或返回结果变化会直接进入 Better Sidebar 类型检查。

`readPersistedSession()` 打开一个不取得归属的 read 句柄，读取经过校验的完整日志，并在返回 `SessionInspection` 元数据、精确 `inheritedEventCount` 与事件前关闭句柄。读取成功后的关闭失败会拒绝操作；同时发生读取与关闭失败时会生成携带两个失败的 `AggregateError`。路由专属解析与 preset 组合会在句柄关闭后开始。冷工作目录查询会传播读取失败；Changes 视图把不可用的冷读取映射为空窗口。Side Chat 使用同一 helper 完成持久模型检查与冷恢复 setup，只从精确 child-owned 后缀折叠模型状态，使用 `stat()` 检查冷模型选择身份是否存在，并在关闭时使用 `list()` 判断持久化发布状态。未被调用的 thread-log reader 被删除。

## Alternatives considered

**在本地镜像上恢复 `inspect()` 兼容方法。** 未采用，因为该镜像会继续接受已挂载服务不具备的方法，并隐藏后续 Service Definition 变化。

**通过 Session Query 执行这些读取。** 未采用，因为 Side Chat 必须在调用 Agent resume 前取得持久化 preset 与模型，而 Better Sidebar 把 persistence 当作可选 Host 能力，并不要求 Session Query provider。直接 read 句柄保留了该组合，也不会把 live-preferred query 行为引入冷路由检查。

## Consequences

Side Chat 冷恢复会在释放 read 句柄后进入 Agent 写入归属，因此活跃 writer 会产生预期的归属错误，而不是缺少方法错误。嵌套 Side Chat 尚无自有请求时会使用自身 descriptor 模型，而不是继承的父 descriptor 或请求。持久模型检查、冷工作目录回退、Changes 事件重放与关闭时的持久发布判断都会消费当前 persistence 服务结果。每次正文读取都会报告句柄关闭失败，并在成功和失败时释放句柄。

## Testing

Persistence read 测试覆盖成功读取元数据与事件、读取失败、关闭失败、读取与关闭同时失败、冷工作目录错误传播、Changes 空结果回退，以及每条路径上的句柄关闭。Side Chat 生命周期测试覆盖正式 `stat` 与 `list` 结果、按精确 inherited cut 恢复模型、成功恢复 preset、读取和解析失败、下游 preset 组合失败，以及在这些下游操作前关闭句柄。无密钥 Web Side Chat 流程会持有活跃 write 句柄，并验证冷恢复到达预期归属拒绝、保留草稿且不改变持久化日志。
