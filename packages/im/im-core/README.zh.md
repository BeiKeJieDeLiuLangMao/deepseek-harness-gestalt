# @deepseek-ai/dsh-im-core

[English](README.md) | 中文

DeepSeek Harness 的 IM 领域配置、账号与路由核心服务。

## 概述

`im-core` 在 `StorageDomain` 之上管理外部 IM 账号、工作区路由规则、群聊触发条件以及模拟目标绑定。它将凭据引用与敏感秘密严格隔离，确保指定会话规则优先于全部规则，停用规则保留绑定且不回退至全量规则，并保证未配置的会话绝不触发敏感工作区。

## 服务

配置与路由服务挂载于 `ctx.imConfig`，消息历史、游标进度与出站生命周期追踪服务挂载于 `ctx.imDelivery`。

### 公共方法：imConfig

- `getAccount(id: ImAccountId): Promise<ImAccountMetadata | undefined>`
- `listAccounts(): Promise<ImAccountMetadata[]>`
- `upsertAccount(options: CreateImAccountOptions): Promise<ImAccountMetadata>`
- `pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata>`
- `deleteAccount(id: ImAccountId): Promise<boolean>`
- `getRouteRule(id: ImRouteRuleId): Promise<ImRouteRule | undefined>`
- `listRouteRules(workspaceId?: WorkspaceId): Promise<ImRouteRule[]>`
- `createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule>`
- `updateRouteRule(id: ImRouteRuleId, updates: Partial<Pick<ImRouteRule, 'workspaceId' | 'enabled' | 'groupTrigger'>>): Promise<ImRouteRule>`
- `deleteRouteRule(id: ImRouteRuleId): Promise<boolean>`
- `resolveRoute(request: ImResolveRouteRequest): Promise<ImResolveRouteResult>`
- `getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined>`
- `setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig>`
- `deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean>`

### 公共方法：imDelivery

- `receiveInbound(options: ReceiveInboundOptions): Promise<ReceiveInboundResult>`
- `markSubmitted(options: MarkSubmittedOptions): Promise<ImConversationCursor>`
- `getCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined>`
- `queryHistory(options: ImHistoryQueryOptions): Promise<InboundMessageRecord[]>`
- `registerOutbound(options: RegisterOutboundOptions): Promise<OutboundMessageRecord>`
- `settleOutbound(options: SettleOutboundOptions): Promise<OutboundMessageRecord>`
- `getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined>`
- `cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]>`

## 不变量

- **凭据引用**：仅存储不透明的称名 `CredentialRef`；真实秘密由 credentials seam 托管。
- **指定优先**：指定会话规则始终覆盖 `all` 全量规则。
- **停用保留绑定**：停用指定规则时保留其工作区绑定；解析结果返回 `disabled`，绝不回退至全量规则。
- **单会话单一工作区**：指定会话在未显式改绑前不能同时绑定多个工作区。
- **未配置不触发**：未匹配规则的会话解析为 `unconfigured`，防止敏感工作区被误触发。
- **群触发条件校验**：群聊规则必须至少配置一项正数触发条件（@提到、每 N 条新消息或固定间隔秒数）。
- **模拟目标限制**：工作区模拟配置的目标必须为已配置的合法账号，且必须有覆盖该目标会话的已配置路由规则。路由规则可归属于其他被测工作区，停用规则或暂停账号依然允许模拟。
- **投递阶段与游标推进**：严格区分阶段（`received` != `submitted` != `sent`）。入站消息必须先落库存储，再推进游标序列号。
- **幂等去重与 Scope 隔离**：消息按 `(scopeId, externalMessageId)` 严格去重。转义编码防止真实 Scope 与模拟 Scope 发生冒号碰撞。
- **出站安全与未知状态处置**：不明确回执标记为 `result_unknown`，严禁盲目自动重试。会话停用时阻止待发 AI 出站消息，重新启用时绝不批量补发。
- **无需独立 Invariant 伴生插件**：`im-core` 借助 `StorageDomain` 管理持久化状态与单 root 原子一致性，不存在分歧观察或跨进程桥接，因此无需导出独立的 `./invariant`。
