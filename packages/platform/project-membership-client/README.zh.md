---
description: "通过 /v1/projects 路由管理云端项目、名册、在线状态、邀请与成员的浏览器客户端。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-project-membership-client`

[English](README.md) | 中文

## 概述

通过 `/v1/projects` 创建或恢复 Project、读取带 presence 的成员清单、管理邀请，以及管理成员角色和标签。传输层校验应答、明确处理生产环境中的未绑定或空应答，并返回已鉴权 Account id 供本地精确绑定。每个请求使用 Account 会话呈现 header，绝不暴露 Installation 签名密钥。

## 目录

- [包约定](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

面向 Project Membership 的浏览器客户端，走 HTTP Consumer 的 `/v1/projects` 路由。`ProjectMembershipHttpTransport` 把云项目创建、按规范化 remote 恢复当前 Account 的 Project、带在线状态的成员名册读取、presence 心跳与最后窗口关闭、按 GitHub 登录名发出并指定授予角色的邀请、邀请决定、撤回、含该角色的可信被邀方卡片、按 Project 读取的权威已发出待确认邀请，以及成员角色、职能标签与移除管理，映射到线上契约。创建与 remote 恢复会在 Project 旁返回已鉴权 Account id，让 Desktop 组合可以持久化精确本地绑定而不暴露凭据。`projectByRemote` 把 HTTP 204 与生产环境的 HTTP 404 视为未绑定，而不是传输失败。`pendingInvitations` 把生产环境的 HTTP 404 视为空列表。每次请求携带调用方提供的 Account 会话 presentation 头，且不会暴露安装签名私钥。失败应答保留稳定信封：传输层解析 `{ error: { code, message } }`，以携带领域码与 HTTP 状态码的 `ProjectMembershipClientError` 拒绝，403 角色门槛呈现为 `ROLE_REQUIRED`/403；非 JSON 的代理失败回退为 `HTTP_<状态码>`。所有成功载荷先从 `unknown` 解析，再交给 UI。`ProjectMembershipClient` 是无凭据参数的操作接口，由 Desktop 拥有的已鉴权适配器提供给 renderer 消费方。

<a id="model-experience"></a>
## Model Experience

通过 roster 与 invitation 变更间接影响模型；这些变更随后会出现在 `project_members` 结果和成员定向提问路由中。

#### KV Cache effect

该客户端不增加稳定请求前缀；后续工具结果会反映已提交的成员、角色、标签、邀请与在线状态。

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- 本地 Git 检查、clone、Workspace 注册与 Account/Project 绑定仍由 Host 和 UI 组合负责。

本包不发布运行时不变式配套插件，因为这个无状态 transport 会校验每个响应，且不保留 roster 状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
