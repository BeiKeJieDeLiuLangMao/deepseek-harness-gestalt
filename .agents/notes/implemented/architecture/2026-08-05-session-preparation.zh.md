# Agent Note: 发布前可复用的 Session 准备阶段

Status: implemented

[English](2026-08-05-session-preparation.md) | 中文

## 问题

新建与持久化恢复通过不同的构造流程抵达相同的发布边界。这掩盖了一项不变量：设置必须基于一个未发布的 Session 完成，之后系统才能同时公开这个精确 Session 及其 Agent。

冷历史检查与 Agent 恢复也会分别实体化同一份持久会话日志。本文最初用持久化侧的已准备 Session cache 解决这个问题；该部分已在下文被取代。

## 决策

`SessionPreparation` 持有一个精确的未发布 `Session`，直至发布或回滚。它属于 Session 生命周期，不属于 Agent 生命周期或激活机制。新建流程包装 `SessionStore.prepare()` 的结果；持久化恢复通过会话写句柄读取已存日志、追加 `interruptedTurnClosers`，再包装 `SessionStore.prepare(id, { seed, meta, seedSource: 'persistence' })` 的结果——该恢复分支会直接验证并冻结转移来的对象图。

agent loop 通过同一条设置与发布流水线消费这两种形式：先取得准备对象，围绕 `preparation.session` 构建私有 Agent 上下文，等待可选设置完成，再发布该精确 Session 和 Agent，并在所有退出路径上对准备对象执行 dispose。发布后，live 生命周期由现有 Session 与 Agent store 接管；`SessionPreparation` 本身不负责任何 Agent 行为。

该机制细化了 [Agent 生命周期与所有权决策](2026-06-18-agent-lifecycle-and-ownership-contracts.zh.md)中的发布边界，但不替换其所有权模型。

## 已取代：持久化侧的准备生命周期

本文最初还为持久化定义了 `prepare(id)`/`inspect(id)` 生命周期：由协调器管理有界 LRU，保存冷的未发布 Session，提供排他预留与基于 revision 的复用检查，并在 `prepare`/`load` 内提交修复，使历史分页与后续恢复共享一次冷实体化。[基于句柄的持久化 seam](2026-08-27-handle-based-session-persistence.zh.md)删除了这整套机制：持久化只暴露句柄；恢复通过写句柄读取日志并负责修复；只读观察方（session-query）拥有自己的冷 Session cache，并以 `stat().revision` 变更 token 为 key。读取复用目标保留在该 cache 中；排他预留机制不再保留，因为写句柄的单 writer 所有权已经提供恢复真正需要的排他性。若已准备 cache 原本可以提供 warm Session，恢复现在会通过句柄支付一次完整日志读取；这是句柄决策中记录的已接受代价。

## 边界

- 准备对象是一个可丢弃的所有权窗口，不是 cache：dispose 同步且幂等，发布只接受精确的已准备 Session。
- 新建流程绝不隐式认领持久化身份。持久化冲突继续被拒绝（`SessionAlreadyExistsError`、`SessionAlreadyOwnedError`）。
- live Session 由现有 store 拥有；准备对象只持有未发布 Session。

## 验证

agent-loop 测试固定 create、`createAgent` 与 resume 共用的发布流水线，包括设置失败、取消与 teardown 时的回滚，并验证 dispose 会释放写句柄（随后可以重新打开写入）。Session-store 测试固定恢复分支中直接验证并冻结的转移。

## 考虑过的替代方案

**由历史读取激活 Agent。** 不采用，因为分页会使仅用于查询的 Agent 长期保持 live，并把 cache 退出问题转移到 Agent 生命周期。这项理由仍约束 session-query 冷 cache：观察绝不创建 Agent。

**只缓存 `{ meta, events }`。** 当时未采用，因为恢复仍需从缓存值重新构造 Session。在句柄 seam 下，这正是读取侧的现行做法——session-query 按 revision 缓存只读的冷 Session——而恢复会从句柄读取中重建，用一次写入所有权入口换掉 warm Session 复用。

**在 agent loop 中增加恢复事务或协调器。** 不采用，因为冷读与 Session 构造属于持久化和 Session 职责。agent loop 只需要统一的 `SessionPreparation` 所有权边界；句柄 seam 保留了这项分工，同时把修复移到 loop 的恢复路径。

## 后果

新建与恢复共享同一发布协议，不会合并 Agent 与 Session 职责，并且每条退出路径都只 dispose 一个准备对象。本文最初记录的持久化侧复用后果（共享冷实体化、LRU 上限、预留协调）现在属于[句柄决策](2026-08-27-handle-based-session-persistence.zh.md)及取代它们的 session-query cache。
