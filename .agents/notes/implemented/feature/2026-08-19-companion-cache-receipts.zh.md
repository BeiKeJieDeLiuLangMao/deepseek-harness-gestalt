# Agent Note：Companion Cache 与不确定 operation 结算

Status: implemented

[English](2026-08-19-companion-cache-receipts.md) | 中文

## 问题

Issue #40（#27 的一部分）：Remote Offline 期间，Mobile 必须继续展示最后确认的 Workspace/Session 元数据与 transcript，同时不得在静态存储中泄露它们；必须拒绝一切 mutation；必须解决断线期间丢失 Desktop 结果的 mutation——且不能变成会静默重放工作的离线 outbox。清除单个配对 Desktop 的缓存内容不得破坏维持配对有效的密钥。

## 决策

**一个结算 controller，没有 outbox。** `CompanionUncertainOperationSettlement` 拥有完整的不确定 operation 生命周期：门控、传输确认、回执持久化与对账。`transmit` 在触碰 transport 前先读取已有回执：`unknown` 抛错（必须先对账），`committed` 返回已存回执，只有缺失或 `not-submitted` 回执才可以发送。传输适配器契约（`CompanionMutationTransport`）要求 `send` 在 mutation 离开设备后、返回前恰好一次等待 `onTransmitted` 钩子（`void | Promise<void>`）；只有此时 controller 才持久化 `unknown` Operation Receipt。controller 中刻意不存在重试、排队或重放路径——对账通过协议的 `query-operation-status` operation 按 operation id 读取 Desktop 的权威答案，把每张回执结算为 `committed`（保留 Desktop 原始结果）或 `not-submitted`（显式未提交）。不确定性是用户可见状态，绝不是待发送队列。Desktop Companion 适配器应答该查询；Relay 只转发密文。

**加密密钥经 Personal Pairing seam 派生。** #31 尚未完成；缓存把按 Desktop 的 AES-GCM 密钥视为注入的 `CompanionCacheKeySource`。生产接线将由 #31 建立的配对材料派生缓存密钥；此处不含任何配对逻辑。每条记录携带全新随机 12 字节 IV，`seal`/`open` 把 `desktopId` 与内容 kind 绑定为 AES-GCM AAD。`open` 与 `loadOpenedContent` 用调用方提供的 desktop id 选择密钥和 AAD。IndexedDB 读取会解析 `desktopId`、12 字节 IV、密文字节与品牌化回执字段；`loadOpenedContent` 拒绝所存 desktop id 与请求不符的行。

**排除清单是缓存在边界强制的允许清单。** `companionCacheAdmits` 只允许 `workspace-metadata`、`session-metadata` 与 `transcript`；其余一切——附件字节、终端内容、spill 文件、凭据及任何未知 kind——都被排除，`CompanionCache.saveOpenedContent` 对排除 kind 大声失败而非静默跳过。

**离线门控位于做决策的操作本身。** Remote Offline 时 `transmit` 在触碰 transport 前拒绝，覆盖全部 mutation kind（prompt、cancel、approval、question、attachment、other）；缓存读取不受影响，因为它不经过 controller。

**缓存行按账号隔离，并与配对密钥分开存放。** `IndexedDbCompanionCacheStore` 要求 `companionCacheDatabaseName(environment, accountId)`（`${accountStorageNamespace(environment, accountId)}:companion-cache`）；没有安装级全局默认名，因此账号切换会隔离缓存与回执。配对密钥记录使用配对 seam 自有存储及不同后缀。`clearDesktop` 只删除缓存数据库中该 Desktop 的行。`saveOpenedContent` 把明文 UTF-8 字节限制在 `transcriptPageBytes` 或 `companionMessageBytes`；存储把回执数量限制在 `containerValues`。

**协议扩展而非新通道。** `query-operation-status` operation 与 `status` 结果（带原始结果的 committed，或显式 `absent`）扩展现有版本化 Companion codec：committed 的 status 内嵌同一 operation id 的 confirmed 结果，absent 的 status 仅为 `{ absent: true }`，两种标记也不能共存。Desktop Companion 适配器应答 status 查询；Relay 只转发密文。codec 与 Mobile 结算在此交付。

## 结果

`CompanionCache`、`WebCryptoCompanionCacheCipher`、`IndexedDbCompanionCacheStore` 与 `CompanionUncertainOperationSettlement` 随 `apps/mobile/src/companion-cache.ts` 交付，并附带纯函数门控助手，且尚未接入 Mobile 入口。Companion codec 携带 `query-operation-status` 与两种 `status` 结果。Desktop Companion 适配器通过注入的 `CompanionMutationTransport` 应答 status 查询；缓存加密密钥经 `CompanionCacheKeySource` 到来，直到 #31 提供真实配对派生密钥。`apps/mobile/tests/companion-cache.spec.ts` 证明静态密文（IndexedDB 原始行不含明文）、按 Desktop 密钥与 AAD 隔离（任意 desktop id 都返回 B 密钥时无法打开 A 的行）、排除清单、字节与回执上限、持久化行校验、账号命名空间隔离、离线门控（transport 发送计数保持 0、回执保持为空、缓存读取成功）、发送前查阅回执（unknown 时发送计数保持 0）、仅在传输后写回执、对账语义以及无自动重放。`packages/platform/remote-protocol/tests/companion.spec.ts` 证明 codec 往返与拒绝伪造 status 应答；无密钥 assembled example（`examples/remote-protocol`）通过 Loader 启动的 snapshot 端到端携带重连 status 查询段。

## 备选方案

- **在重连时重放不确定 operation 的离线 outbox** — 否决：Desktop 权威 mutation 绝不能由 Mobile 自行重发；不确定性只能通过 Desktop 按 operation id 的答案解决。
- **controller 旁另建 readiness/rollback 状态机** — 依单生命周期 controller 规则否决；传输确认与对账是同一操作的阶段。
- **对回执也加密** — 回执只含 operation id 与结算状态，不含已打开内容，因此按 Desktop 的 AES-GCM 保护目标是实际承载 Workspace/Session 数据的内容行。
