---
description: "无状态多实例 Remote Relay 的 Redis 临时协调 Provider。"
kind: "package-reference"
---

# 远程访问 Redis

[English](README.md) | 中文

## 概述

无状态多实例 Remote Relay 的 Redis 协调 adapter。它使用维护中的 `redis` 客户端，以及由部署提供的环境域 key prefix。Redis URL 在运行时通过 secret 注入，本包不会记录或持久化它。

adapter 只存储会过期的 attachment 目录值：不透明 route 与 attachment id、endpoint 类型、Platform Instance id、连接 token、route revision 和过期时间。条件式 Lua refresh 与 unregister 会比较连接 token，因此旧 socket 的清理无法删除替代连接。直达 Pub/Sub channel 将有界 Relay 密文 envelope 传给一个在线 Platform Instance；另一条 channel 传递不含内容的 route 失效事件。值经过解析，所有 wire id 在进入 Relay provider 前都会品牌化。

本包绝不创建 Redis Stream、List 或其他离线 queue。publish 的订阅者数量只表示 transport 接纳；发送方还会等待由不透明 id 关联、有时限且不含内容的 delivery acknowledgement。因此 stale target、静默丢弃或 acknowledgement 超时都会返回 `REMOTE_OFFLINE`。Redis 不含 prompt、Session、approval、model、Workspace 或其他 DSH business value。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

通过 Relay 协调与密文投递间接影响模型；它们会把经鉴权 Companion operation 传给面向模型的 Consumer。

#### KV Cache 影响

Redis Provider 不增加稳定请求前缀；路由与失效状态决定哪些配对 operation 能抵达下游 Host Consumer。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- Redis 服务供应、TLS、鉴权、监控与可用性由部署负责。
- 持久 route credential digest 与 revision 属于部署的 `RelayRouteStore`，不属于 Redis 协调。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
