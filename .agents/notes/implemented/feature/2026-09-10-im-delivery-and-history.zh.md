# IM 消息历史、游标进度与可靠出站投递

[English](2026-09-10-im-delivery-and-history.md) | 中文

- 领域：`area/session`
- 类别：`kind/feature`
- Issue：#616（#613 子任务）
- 上游：T1 IM 领域配置与路由（#615）

## 问题背景

实时 IM 账号接管需要可靠的消息历史、游标推进、去重以及出站交付保障机制。具体而言：
1. 外部平台或模拟通道的入站消息必须按会话作用域（Scope）和外部消息 ID 严格去重，绝不跨 Scope 串话。
2. 入站消息必须先完成持久化存储，再推进接收进度游标。
3. 严格区分消息生命周期阶段（`received` != `submitted` != `sent`），确保崩溃重启恢复时能够且仅补发已接收未提交的消息，绝不重复提交已入队消息。
4. 出站投递必须区分发送前检查失败（如路由停用、账号暂停、未配置规则）与模糊平台回执（`result_unknown`）。未知回执绝不盲目重发。
5. 停用会话时必须阻止待发的 AI 出站回复，重新启用时绝不批量回冲（flush）。

## 解决方案

在 `@deepseek-ai/dsh-im-core/delivery` 中实现了公共 `ImDeliveryService` 服务及独立的 `im_delivery` 存储领域：
- **领域表设计**：包含 `inbound_messages`、`outbound_messages`、`cursors` 与 `dedup` 四张表。
- **Scope 标识编码**：采用严格转义防冒号碰撞，隔离真实通道（`real:${platform}:${accountId}:${conversationId}`）与模拟实例（`sim:${instanceId}:${conversationId}`）。
- **幂等去重**：落库前通过带作用域的外部键执行原子去重检查。
- **先写入后游标**：必须完成入站消息写入后，才推进 `lastReceivedSequenceNumber` 与 `unsubmittedCount`。
- **阶段流转**：通过 `markSubmitted` 将状态流转为 `submitted` 并推进 `lastSubmittedSequenceNumber`。
- **出站检查与未知回执保护**：发送前验证 AI 回复的路由有效性，放行人工手动发送。回执不明保持 `result_unknown`，绝不盲目重发。
- **取消待发 AI**：会话停用时终止待发 AI 回复，防止重新启用时批量重放。
