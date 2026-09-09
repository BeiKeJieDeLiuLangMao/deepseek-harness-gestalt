---
description: "无状态多实例 Remote Relay 的 Redis 临时协调 Provider。"
kind: "package-reference"
---

# 远程访问 Redis

[English](README.md) | 中文

## 概述

通过带过期时间的 Redis 目录条目和有界密文 Pub/Sub envelope 协调无状态 Remote Relay 实例。部署提供环境 key 前缀和秘密 Redis URL，本包绝不记录或持久化该 URL。带 token 比对的刷新与注销操作可防止陈旧 socket 清理删除替代连接。

## 目录

- [包约定](#package-contract)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

无状态多实例 Remote Relay 的 Redis 协调 adapter。它使用维护中的 `redis` 客户端，以及由部署提供的环境域 key prefix。Redis URL 在运行时通过 secret 注入，本包不会记录或持久化它。

adapter 只存储会过期的 attachment 目录值：不透明 route 与 attachment id、endpoint 类型、Platform Instance id、连接 token、route revision 和过期时间。条件式 Lua refresh 与 unregister 会比较连接 token，因此旧 socket 的清理无法删除替代连接。直达 Pub/Sub channel 将有界 Relay 密文 envelope 传给一个在线 Platform Instance；另一条 channel 传递不含内容的 route 失效事件。值经过解析，所有 wire id 在进入 Relay provider 前都会品牌化。

本包绝不创建 Redis Stream、List 或其他离线 queue。publish 的订阅者数量只表示 transport 接纳；发送方还会等待由不透明 id 关联、有时限且不含内容的 delivery acknowledgement。因此 stale target、静默丢弃或 acknowledgement 超时都会返回 `REMOTE_OFFLINE`。Redis 不含 prompt、Session、approval、model、Workspace 或其他 DSH business value。

<a id="model-experience"></a>
## 模型体验

无，因为 Redis Provider 只携带 Relay 路由与密文，不创建发往模型的内容。

#### KV Cache 影响

Redis Provider 不增加模型请求内容，因此不影响提供方缓存复用。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- Redis 服务供应、TLS、鉴权、监控与可用性由部署负责。
- 持久 route credential digest 与 revision 属于部署的 `RelayRouteStore`，不属于 Redis 协调。

本包不发布运行时不变式配套插件，因为每个 Redis coordinator 操作都会直接校验外部值，且不公开独立的事件与状态读取器组合。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
