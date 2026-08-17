# `@deepseek-ai/dsh-remote-access`

[English](README.md) | 中文

Remote Access Service Definition 与单进程 Personal Pairing provider。`ctx.remoteAccess` 对每个 Desktop Installation 默认关闭 Mobile Access，直到用户在 Settings 中开启；它创建两分钟单次 invitation，要求两个 Installation 都通过 Platform Account public service 解析到同一 Account，并且仅在 Desktop 明确确认后授予 Device Principal。

QR payload 与完整的一次性 HTTPS 链接完全相同，携带 256-bit invitation secret、Desktop fingerprint、rendezvous id、expiry 与 protocol major。handshake 完成后保持 pending，两个 Installation 显示由 handshake hash 派生的同一组六个 authentication words。expiry、cancel、account mismatch、reject、成功 completion 与 disablement 都会销毁相应 crypto-provider capability。completion 与 confirmation id 让重试保持幂等，串行 mutation 保证并发 completion 只有一个获得 invitation。

`PairingHandshakeProvider` 是唯一的密码 adapter seam。本包不实现 Noise，也不派生 pairing key。每次 activation 必须返回唯一、由 provider 拥有的 key reference；生成的 Device Principal 只有 `companion-surface` authority。keyless example 是 assembled lifecycle proof，不是产品密码实现。

## Model Experience

无，因为 pairing metadata、Device Principal origin 与 Settings state 从不进入模型请求。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- 在独立评审者接受 Snow proof 且组装经过评审的 `PairingHandshakeProvider` 之前，产品 activation 保持 fail-closed。
- 随附 provider 为 acceptance 与 composition 持有单进程 state。持久化多实例存储、Relay routing、revocation fan-out 与 production HTTP transport 属于后续 Remote Access deployment 工作。
