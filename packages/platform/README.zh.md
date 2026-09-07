---
description: "Platform 包组：Account Session、Project Membership、Personal Pairing、Remote Relay、加密 attachment 及其客户端和 transport。"
kind: "package-group"
---

# Platform

[English](README.md) | 中文

## 概述

Platform 包拥有 DeepSeek Gestalt Desktop 与 Mobile 共用、且独立于具体安装的身份及会话行为。本组拆分 Service Definition、Provider、公开 HTTP Consumer、安装客户端、codec 与协调 adapter。部署持久化、共享失效传输、密钥与可观测性 adapter 归 Platform composition root 所有；这些包定义并验证相应的必需接口，不嵌入部署凭证。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

十六个包覆盖账号身份、云端项目成员关系、加密配对与 Relay transport，以及 attachment 交付。

| 包 | npm 名称 | 角色 | `ctx` 键 |
|---|---|---|---|
| [`platform-account/`](platform-account/README.zh.md) | `@deepseek-ai/dsh-platform-account` | Account Service Definition 和公共类型 | `ctx.platformAccount` |
| [`platform-account-core/`](platform-account-core/README.zh.md) | `@deepseek-ai/dsh-platform-account-core` | GitHub 身份与当前安装 Account Session Provider | 提供 `ctx.platformAccount` |
| [`platform-account-http/`](platform-account-http/README.zh.md) | `@deepseek-ai/dsh-platform-account-http` | 固定回调与安装会话 HTTP 路由 | Consumer |
| [`platform-account-client/`](platform-account-client/README.zh.md) | `@deepseek-ai/dsh-platform-account-client` | Desktop/Mobile 证明、受保护存储与账号域命名空间客户端 | Consumer library |
| [`project-membership/`](project-membership/README.zh.md) | `@deepseek-ai/dsh-project-membership` | Project Membership Service Definition 和公共类型 | `ctx.projectMembership` |
| [`project-membership-core/`](project-membership-core/README.zh.md) | `@deepseek-ai/dsh-project-membership-core` | 持久化成员关系、邀请与角色的 Provider | 提供 `ctx.projectMembership` |
| [`project-membership-http/`](project-membership-http/README.zh.md) | `@deepseek-ai/dsh-project-membership-http` | 项目注册表、名册、邀请与成员管理 HTTP 路由 | Consumer |
| [`project-membership-client/`](project-membership-client/README.zh.md) | `@deepseek-ai/dsh-project-membership-client` | 项目成员关系与管理的浏览器 transport | Consumer library |
| [`project-membership-desktop/`](project-membership-desktop/README.zh.md) | `@deepseek-ai/dsh-project-membership-desktop` | 面向 Agent preset 的 Desktop 已鉴权读取 Provider | `ctx.desktopProjectMembership` |
| [`noise-channel/`](noise-channel/README.zh.md) | `@deepseek-ai/dsh-noise-channel` | Snow XKpsk3 配对、attachment-bound IK 与加密 Companion 消息通道 | Endpoint library |
| [`remote-access/`](remote-access/README.zh.md) | `@deepseek-ai/dsh-remote-access` | Mobile Access 与 Personal Pairing lifecycle、crypto adapter 和 Companion-only Device Principal | `ctx.remoteAccess` |
| [`remote-access-client/`](remote-access-client/README.zh.md) | `@deepseek-ai/dsh-remote-access-client` | 配对 HTTP transport 与可重连 Mobile/Desktop Relay lifecycle | Consumer library |
| [`remote-access-http/`](remote-access-http/README.zh.md) | `@deepseek-ai/dsh-remote-access-http` | 配对 HTTP 与 Relay WSS Consumer | Consumer |
| [`remote-access-redis/`](remote-access-redis/README.zh.md) | `@deepseek-ai/dsh-remote-access-redis` | 会过期的 Relay 目录、失效通知与直达密文 Pub/Sub | Coordination adapter |
| [`remote-protocol/`](remote-protocol/README.zh.md) | `@deepseek-ai/dsh-remote-protocol` | Relay 与加密 Companion codec、协商、错误和限制 | Pure protocol module |
| [`remote-attachments/`](remote-attachments/README.zh.md) | `@deepseek-ai/dsh-remote-attachments` | 配对范围的加密 attachment blob store 与 HTTPS Consumer | `ctx.remoteAttachments` |

-----

<a id="related-documentation"></a>
## 相关文档

- [Platform Account 子系统](../../docs/subsystems/platform-account.zh.md)——账号身份、授权、安装证明与路由。
- [Project Membership 子系统](../../docs/subsystems/project-membership.zh.md)——云端项目、角色、邀请、在线状态与成员提问。
- [Remote Protocol 子系统](../../docs/subsystems/remote-protocol.zh.md)——Personal Pairing、Relay transport、加密 Companion 消息与 attachment。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
