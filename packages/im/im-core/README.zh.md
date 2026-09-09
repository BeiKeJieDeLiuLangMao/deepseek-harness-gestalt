# @deepseek-ai/dsh-im-core

[English](README.md) | 中文

DeepSeek Harness 的 IM 领域配置、账号与路由核心服务。

## 概述

`im-core` 在 `StorageDomain` 之上管理外部 IM 账号、工作区路由规则、群聊触发条件以及模拟目标绑定。它将凭据引用与敏感秘密严格隔离，确保指定会话规则优先于全部规则，停用规则保留绑定且不回退至全量规则，并保证未配置的会话绝不触发敏感工作区。

## 服务

挂载于 `ctx.imConfig`。

### 公共方法

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

## 不变量

- **凭据引用**：仅存储不透明的称名 `CredentialRef`；真实秘密由 credentials seam 托管。
- **指定优先**：指定会话规则始终覆盖 `all` 全量规则。
- **停用保留绑定**：停用指定规则时保留其工作区绑定；解析结果返回 `disabled`，绝不回退至全量规则。
- **单会话单一工作区**：指定会话在未显式改绑前不能同时绑定多个工作区。
- **未配置不触发**：未匹配规则的会话解析为 `unconfigured`，防止敏感工作区被误触发。
- **群触发条件校验**：群聊规则必须至少配置一项正数触发条件（@提到、每 N 条新消息或固定间隔秒数）。
- **模拟目标限制**：工作区模拟配置的目标必须为已配置的合法账号。
