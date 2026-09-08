---
description: "GitHub 身份与当前安装 Account Session 的 Platform Account Service Definition。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-platform-account`

[English](README.md) | 中文

## 概述

本包定义 Platform 账号身份及绑定到单个 Desktop 或 Mobile 安装的账号会话服务。`AccountService` 通过 `ctx.platformAccount` 拥有登录尝试创建、GitHub 回调完成、签名轮询、访问令牌刷新、当前账号读取、已鉴别当前安装读取、当前安装退出登录和连接跟踪。Mobile Login Attempt 会把有界设备名称与 iOS 或 Android 平台提交到生成的 Account Session。`currentInstallation()` 会随账号投影返回由提供方绑定的 Installation id、类型与 Mobile 展示，因此其他能力无需读取账号表，也无需信任调用方自行提供的身份字段。Quota admission 只按行是否存在检查已有 Installation，不解码旧会话 payload，因此强制登录可以原子替换引入展示字段前创建的 Mobile 行。

公共类型对账号、登录尝试、账号会话、安装和证明 JTI id 使用品牌类型。运行时 `AccountError` 为无效或过期尝试、无效或重放证明、过期或已撤销会话，以及携带秒级 `retryAfter` 的开放注册 `QUOTA` / `PLATFORM_CAPACITY` 失败提供稳定错误码；`./types` 子路径保持仅含类型。规格固定上限为每个账号 10 个在线 Desktop 安装、10 个在线 Mobile 安装，以及 20 条并发被跟踪连接。可选的共享 `PlatformCapacityState` 会拒绝新的登录，已建立会话仍可使用。

`loadOperatedPlatformEnvironment` 是产品入口 parser：它只接受一套完整生产身份，并拒绝本地 origin。`loadPlatformEnvironment` 仅供 example 与测试等范围受限的 composition 校验并选择开发／生产身份对。产品客户端通过部署所有的构建产物取得实际运行身份，不提供运行时开发 selector。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

通过 Project Membership、Personal Pairing 与接收 Session 工作所消费的 Account 身份和安装状态间接影响模型。

#### KV Cache 影响

该 Service Definition 不增加稳定请求前缀；下游 Consumer 会渲染或使用其经鉴权的身份与安装记录。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- 账号删除、会话列表、远程退出、全部退出、恢复和身份关联不属于本服务。
- 个人配对是独立能力，`signOut` 永远不会删除它。

本包不发布运行时不变式配套插件，因为此 Service Definition 及其 parser、quota 与类型不拥有 Provider 状态或事件流。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
