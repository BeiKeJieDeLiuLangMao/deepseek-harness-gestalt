# 远程访问 Redis

[English](README.md) | 中文

无状态多实例 Remote Relay 的 Redis 协调 adapter。它使用维护中的 `redis` 客户端，以及由部署提供的环境域 key prefix。Redis URL 在运行时通过 secret 注入，本包不会记录或持久化它。

adapter 只存储会过期的 attachment 目录值：不透明 route 与 attachment id、endpoint 类型、Platform Instance id、连接 token、route revision 和过期时间。条件式 Lua refresh 与 unregister 会比较连接 token，因此旧 socket 的清理无法删除替代连接。直达 Pub/Sub channel 将有界 Relay 密文 envelope 传给一个在线 Platform Instance；另一条 channel 传递不含内容的 route 失效事件。值经过解析，所有 wire id 在进入 Relay provider 前都会品牌化。

本包绝不创建 Redis Stream、List 或其他离线 queue。没有在线订阅者时，publish 返回 false，使 Relay provider 立即返回 `REMOTE_OFFLINE`。Redis 不含 prompt、Session、approval、model、Workspace 或其他 DSH business value。

## 模型体验

无，因为 Redis Relay 协调永不进入模型请求。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- Redis 服务供应、TLS、鉴权、监控与可用性由部署负责。
- 持久 route credential digest 与 revision 属于部署的 `RelayRouteStore`，不属于 Redis 协调。
