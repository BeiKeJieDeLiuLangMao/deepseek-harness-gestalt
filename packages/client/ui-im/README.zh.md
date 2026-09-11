---
description: "IM 账号设置、工作区接管与模拟卡片，以及 Better Sidebar 的 IM 对话标签页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-im

[English](README.md) | 中文

## 概述

本插件提供已认可的 IM GUI：设置 → IM 账号用于钉钉 DWS 与旺旺凭据引用连接；工作区设置中的接管规则与模拟目标卡片；以及 Better Sidebar 的 IM 对话标签页。审批仍只走原生审批界面。密钥不会出现在列表、提示或快照中。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在「设置 → IM 账号」连接钉钉或旺旺账号。在「工作区设置 → IM 接管」添加规则；新规则默认停用，停用指定规则会保留绑定。在「工作区设置 → IM 模拟」选择已配置目标后，模拟工具才可用。打开 IM 对话标签页可查看发送者徽标与投递状态，在自动处理关闭时手动发送，并在模拟用户与被测 Agent 会话之间切换。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`apply` 注册 `settings.section`（id `im-accounts`）、两张 `workspace.settings.section` 卡片（`im-takeover`、`im-simulation`），以及一个官方 Sidebar 标签（`@deepseek-ai/dsh-client-ui-im/conversation`）。账号、路由与模拟目标经 `ctx.remote.imConfig` 持久化。对话流从 `ctx.remote.imDelivery`（`queryHistory`、`listOutbound`）刷新；人工发送调用 `registerManualOutbound`，不 flush 适配器。条上的启用/停用写入 `updateRouteRule({ enabled })`，停用时再调 `cancelPendingAiOutbound`。模拟用户与被测 Agent 按钮经 `uiWorkspace.openWorkspace` 打开绑定工作区。模拟用户与被测 Agent 角色从 `ctx.remote.imSimulation` 读取运行中的实例；「创建模拟实例」调用 `createInstance({ workspaceId })`；「以成员发送」调用 `injectMemberMessage`；被测角色「以本人发送」调用 `injectManagedHumanMessage`；「结束模拟实例」调用 `stopInstance`。这些 Remote 都不 flush 适配器。旺旺密钥只用于生成凭据引用后即丢弃。不提供飞书。组合：`tsconfig.client.json` 引用本包；`packages/bundle/web-app/cordis.patch.yml` 带有 `ui-im` 浏览器行。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [IM 账号接管规范](../../../.agents/design/im-takeover/specification.md)
- [ui-workspace](../ui-workspace/README.zh.md) — 承载 `workspace.settings.section` 的工作区设置弹窗
- [ui-settings](../ui-settings/README.zh.md) — 设置分区 slot
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md) — 官方 Sidebar 标签注册表

<a id="model-experience"></a>
## 模型体验

无。本包是浏览器 GUI 插件，不注册提示词、工具 schema 或会话事件。

#### KV Cache 影响

无；UI 状态不会改变模型请求前缀。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **对话流由 Host 驱动，不是真实出站** — 账号、路由与模拟目标经 `imConfig` remotes 持久化。Sidebar 流列出 `imDelivery` 历史与已入队出站；`registerManualOutbound` 不 flush 适配器。`presentation.ts` 把装配域记录映射为发送者徽标与投递状态；`result_unknown` 绝不是成功。`IM_LIVE_LANE_BEHAVIORS` 点名真实钉钉登录、真实旺旺读取、真实出站、真实模型调用和原生 Desktop GUI computer-use。
- **没有独立运行看板** — 审批只走原生审批界面。
- **没有飞书** — 首期平台仅钉钉与旺旺。

<a id="dev-note"></a>
### 开发备注

无。
