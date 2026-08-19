# `@deepseek-ai/dsh-remote-attachments`

[English](README.md) | 中文

Remote Access 的配对范围加密 attachment blob store。Mobile 通过 HTTPS 上传 endpoint 加密的密文，并获得限定于单个 Personal Pairing、受大小与过期约束的一次性 capability；Desktop 用该 capability 恰好一次地换取密文，校验哈希后在 endpoint 解密，并把 attachment 提交进既有 Session 路径。WSS Relay 路径只承载有界的 `offer-attachment` 控制消息。

## Blob store

`RemoteAttachmentStoreProvider`（`ctx.remoteAttachments`）只保留密文与元数据：capability、所属 `PersonalPairingId`、密文字节与过期时间。已接受的协议上限是固定的——每个 blob 104,857,600 字节（100 MiB）、默认 capability 生命周期 900,000 毫秒（15 分钟）；部署可以配置更低的值（`maxBlobBytes`、`capabilityLifetimeMs`），不能更高。`maxRetainedBlobs` 约束总容量，在清扫过期条目后仍满时以明确的 `ATTACHMENT_CAPACITY` 失败；`sweepIntervalMs` 驱动后台过期清扫。每次成功 `consume`、惰性或清扫过期以及 `revoke` 都会移除 blob 及其 capability。高于上限的错误配置会在构造时失败。

capability 是来自 `parseAttachmentCapability` 的 256 位一次性值；`consume` 拒绝跨配对使用（`ATTACHMENT_PAIRING_MISMATCH`）且不消耗 blob，拒绝未知或已消耗的 capability（`ATTACHMENT_CAPABILITY_INVALID`）与已过期的 capability（`ATTACHMENT_EXPIRED`）。`observe()` 为 Platform 侧运维投影保留的密文与元数据；这一侧边界上不存在明文。

## HTTP 路由

`remote-attachments-http` 插件（`@deepseek-ai/dsh-remote-attachments/http`）在已挂载的 store 上注册三个精确路由，并要求 `webServer`、`remoteAttachments` 与 `remoteAttachmentAuthority` 配对 seam：

- `POST /v1/remote-attachments`——原始密文体；返回 `201` 与 `{ capability, byteLength, expiresAt }`，流式超限时返回 `413 ATTACHMENT_LIMIT_EXCEEDED`。
- `POST /v1/remote-attachments/consume`——`{ capability }` JSON；返回 `200` 与原始密文，跨配对 `403`、未知 `404`、过期 `410`。
- `POST /v1/remote-attachments/revoke`——`{ capability }` JSON；返回 `204` 并移除 blob。

## 配对 seam

`RemoteAttachmentAuthority.authenticate({ headers })` 把一个 HTTPS 请求映射到恰好一个 `PersonalPairingId`。Personal Pairing 层（issue #31）拥有生产实现；它永远看不到 attachment 字节。缺失 authority 服务会使插件加载响亮失败。

## 模型体验

无，因为 attachment 密文与 capability 永不进入模型请求。

#### KV Cache 影响

无。

## 已知限制与延后工作

- 进程内 store 匹配单进程 Platform 部署；多实例 Platform 需要具有相同 `RemoteAttachmentStoreService` 语义的共享 store。
- 生产 `RemoteAttachmentAuthority` 随 Personal Pairing（#31）到来；测试使用基于 header 的开发 authority。
