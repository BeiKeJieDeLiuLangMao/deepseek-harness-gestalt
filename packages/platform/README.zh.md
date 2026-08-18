# Platform

[English](README.md) | 中文

Platform 包拥有 DeepSeek Gestalt Desktop 与 Mobile 共用、且独立于具体安装的身份及会话行为。本组分别提供账号服务定义、服务提供方、公开 HTTP 消费方与安装客户端。

| 包 | npm 名称 | 角色 | `ctx` 键 |
|---|---|---|---|
| [`platform-account/`](platform-account/README.md) | `@deepseek-ai/dsh-platform-account` | 账号服务定义和公共类型 | `ctx.platformAccount` |
| [`platform-account-core/`](platform-account-core/README.md) | `@deepseek-ai/dsh-platform-account-core` | GitHub 身份与当前安装账号会话提供方 | 提供 `ctx.platformAccount` |
| [`platform-account-http/`](platform-account-http/README.md) | `@deepseek-ai/dsh-platform-account-http` | 固定回调与安装会话 HTTP 路由 | 消费方 |
| [`platform-account-client/`](platform-account-client/README.md) | `@deepseek-ai/dsh-platform-account-client` | Desktop/Mobile 证明、受保护存储与账号域命名空间客户端 | 消费方库 |
| [`remote-access/`](remote-access/README.md) | `@deepseek-ai/dsh-remote-access` | Mobile Access 与 Personal Pairing lifecycle、crypto adapter 和 Companion-only Device Principal | `ctx.remoteAccess` |
| [`remote-protocol/`](remote-protocol/README.md) | `@deepseek-ai/dsh-remote-protocol` | Relay 与加密 Companion codec、协商、错误和限制 | 纯协议模块 |

部署持久化、共享失效传输、密钥与可观测性适配器归 Platform composition root 所有。本组定义并验证这些适配器必须满足的接口，不嵌入部署凭证。
