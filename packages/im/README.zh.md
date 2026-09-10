---
description: "IM 组地图：面向外部即时通讯平台的账号接管、工作区路由与模拟测试。"
kind: "package-group"
---

# packages/im

[English](README.md) | 中文

## 概述

IM 组为外部通讯平台（如钉钉、旺旺）提供账号接管与消息路由能力。它允许授权账号接收消息，根据配置将消息分发至指定工作区，执行群聊触发规则，并在不连接外部真实平台的前提下进行模拟验证。

## 目录

- [软件包](#packages)
- [相关文档](#related-documentation)

-----

<a id="packages"></a>
## 软件包

| 软件包 | 职责 | ctx 属性 |
|---|---|---|
| [`im-core`](im-core/README.zh.md) | 领域配置、账号元数据、路由规则与模拟目标绑定 | `ctx.imConfig` |
| [`im-wangwang`](im-wangwang/README.zh.md) | 旺旺/千牛 IM 适配器，支持账号接管、消息拉取与可靠出站 | `ctx.imWangwang` |

-----

<a id="related-documentation"></a>
## 相关文档

- [IM 账号接管规范](../../.agents/design/im-takeover/specification.md) — 问题背景、架构契约与用户故事。
- [IM 接管 Agent Note](../../.agents/notes/proposed/feature/2026-09-07-im-account-takeover.zh.md) — 架构不变量与 B0 复核结论。
