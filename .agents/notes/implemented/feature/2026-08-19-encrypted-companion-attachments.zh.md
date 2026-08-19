# Agent Note: 配对范围的加密 attachment 传输

Status: implemented

[English](2026-08-19-encrypted-companion-attachments.md) | 中文

## Problem

Mobile 用户必须向 Desktop 拥有的 Session 附带文件，同时不向 Platform 暴露明文，也不向 WSS Relay 实时流推送大 frame。传输需要一个配对范围的 capability，其大小与过期受已接受上限（每 blob 100 MiB 密文、默认生命周期 15 分钟）约束；跨配对使用、哈希不匹配、过期、传输中断与超限都要显式失败；成功接收、过期或撤销后必须移除 blob 及其 capability。Personal Pairing 本身（#31）尚未构建，配对范围身份只能是注入的 seam。

## Decision

加密路径按边界拆分。`@deepseek-ai/dsh-remote-protocol` 新增有界的 `offer-attachment` Companion operation（capability、SHA-256、精确字节数、过期时间、有界文件名）、带协议原生拒绝原因的 `attachment-rejected` result、256 位 `AttachmentCapability` 品牌及其 parser、固定 wire 上限，以及只被 Mobile 与 Desktop 链接的 endpoint attachment cipher（HKDF-SHA-256 → AES-256-GCM 加 SHA-256 密文哈希）。

`@deepseek-ai/dsh-remote-attachments` 拥有 Platform 侧：`RemoteAttachmentStoreProvider`（`ctx.remoteAttachments`）只保留密文与元数据，签发限定于单个 `PersonalPairingId` 的一次性 capability，强制每 blob 密文上限与生命周期（可从 cordis.yml `Config` 向下配置，不能高于协议上限），以显式 `ATTACHMENT_CAPACITY` 错误约束保留容量，惰性清扫过期，并在会重新武装、由 `dispose()` 取消的后台定时器上清扫，在 publish/inspect/observe/consume 时复制密文，并在 consume、过期与配对范围撤销时移除 blob 及 capability。空密文是 `ATTACHMENT_EMPTY`（HTTP 400），与 `ATTACHMENT_LIMIT_EXCEEDED` 区分。`remote-attachments-http` 插件在已挂载的 store 上暴露 upload/consume/revoke 路由，并通过 `RemoteAttachmentAuthority` seam（`authenticate({ headers }) → PersonalPairingId`）认证每个请求；该 seam 由 #31 的 pairing 层实现，seam 缺失时插件响亮失败。consume 只在 HTTP 响应完成后删除 blob；中途写入失败会保留它以便重试。`revoke` 要求已认证配对，不匹配时以 `ATTACHMENT_PAIRING_MISMATCH` 失败且不删除。

Mobile（`apps/mobile/src/companion-attachment.ts`）上传前用配对派生密钥密封字节，并构造有界控制消息。它把协议上限当作密文限制，并拒绝密封载荷（`明文 + 28`）会超过该上限的明文。Desktop（`apps/desktop/src/companion-attachments.ts`）检查过期与字节上限，通过 HTTPS 下载（`downloadCompanionAttachment` 把 403→`cross-pairing`、404→`absent`、410→`expired`、413→`limit-exceeded`，并发送 `pairingId`），对密文重新哈希，只有校验通过才解密并通过注入的 Session `submit` 回调提交；哈希不匹配永远不会到达解密密钥，哈希之后的 AES-GCM 失败复用 `hash-mismatch`，每种拒绝都映射为一个返回给 Mobile 的协议原生原因。blob 字节只经 HTTPS 移动；WSS Relay 路径只承载加密的有界控制消息。把该下载与 `submit` 接入产品 Desktop Session 路径属于双实例 Companion 收尾（#27）。

## Alternatives considered

**把 blob 作为 Relay 密文 frame 流式传输。** 65,535 字节的密文 frame 上限会把一次 100 MiB attachment 变成数千个实时 frame，违反有界控制消息要求，并让批量传输重新耦合到在线状态。HTTPS 上传/下载保持实时流精简。

**OSS 支撑的 blob store。** 生产 `gestalt-secret` 访问可行，但要引入第二个存储依赖和生命周期规则来表达单次 consume 与立即撤销语义，而进程内 store 已经拥有这些。进程内 `RemoteAttachmentStoreProvider` 匹配当前单进程 Platform 部署；多实例 Platform 存在时可以按 `remote-access-redis` 模式扩展为共享 store。

**Desktop 拥有的 blob 通道。** 对另一网络上的手机而言 Desktop 不是可达的上传目标；Platform 是两个 endpoint 唯一共享的 rendezvous。

## Consequences

无密钥 assembled 测试机械地证明验收标准 6：对 Platform 保留的每个字节（store `observe()` 与每个 HTTP 响应块）扫描明文子序列，只包含密文与元数据；明文相等只在 Mobile 密封与 Desktop 提交 endpoint 断言。跨配对、哈希不匹配（含篡改密文、字节数不匹配与哈希之后的 GCM 失败）、过期、中断、每 blob 密文上限（含 `limit − 28` 接受与 `limit − 27` 拒绝）、空密文、容量、配对范围 revoke、publish 时复制、接收后删除以及 HTTP 状态映射在包与 endpoint 规格中各以显式 code 或协议原生原因失败或成功；可运行的 `examples/remote-protocol` snapshot 端到端展示 Platform 仅见密文。代价：在 #31 落地前配对身份仍是基于 header 的开发 seam；产品 Desktop Session submit 接线仍属 #27；多实例 Platform 必须在不变的 `RemoteAttachmentStoreService` 之后替换进程内 store 为共享实现。
