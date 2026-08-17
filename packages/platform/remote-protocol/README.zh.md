# `@deepseek-ai/dsh-remote-protocol`

[English](README.md) | 中文

Remote Access 的纯 codec 与协商器。本包拥有两个独立版本化的协议，不导入 Harness Workspace、Session、prompt、tool、model、approval、Host API 或 WebSocket 类型。

## Relay Transport Protocol

版本 1 只暴露路由 attachment、不透明密文转发、心跳、撤销、稳定 transport 错误与 transport 版本协商。Relay 标识符是协议原生的品牌化值。解码会拒绝未知消息类型和额外字段，因此完整 Host 请求不能夹带在 transport 元数据旁。

## Encrypted Companion Protocol

Companion major 2 和 1 是当前及紧邻的前一应用版本。双方 endpoint 必须在所选 major 上声明已认证加密、配对密钥隔离与重放保护。协商不受 offer 数组顺序影响，始终选择最高的安全共同 major，因此不安全的共同 major 只能降级到安全的紧邻前一 major。每条逻辑 endpoint 连接拥有一个 negotiation channel。在该 channel 上开始新协商时，会在求值 offer 前让此前的应用 codec token 失效；失败的协商会让 channel 保持未激活，而其他 channel 仍然有效。不存在安全版本交集时，会在编码应用明文前失败，并指出必须更新的 endpoint。

已实现 catalog 包含有界 transcript page projection、prompt 提交 operation 与 Desktop-confirmed result。每个标识符由本协议自行品牌化，不从 Harness 领域包导入。解码时会拒绝不支持的 operation 与 projection 字段。

## Wire 限制与错误

| 限制 | 值 |
|---|---:|
| Parser 深度 | 16 层 |
| 单个对象或数组中的值 | 256 |
| 编码值总数 | 4,096 |
| 单个字符串的 UTF-8 字节 | 90,000 |
| 完整 Relay 消息 | 98,304 字节 |
| 不透明 Noise 消息 | 65,535 字节 |
| 加密前 Companion 应用数据 | 61,440 字节（60 KiB） |
| 完整编码 transcript-page 消息 | 49,152 字节（48 KiB） |
| Transcript page | 50 条 |

`RemoteProtocolError` 为无效输入、超过限制、不兼容 Relay 版本、缺少 Companion 安全 capability、endpoint 必须更新及缺少协商提供稳定 code。诊断不会包含应用明文。二进制 wire 值只接受一种规范的无填充 base64url 拼写；能够解码成相同字节的别名也会被拒绝。60 KiB 应用上限在固定 65,535 字节 Noise 消息上限内为加密开销保留 4,095 字节；Relay frame 上限也能在该最大值下容纳 base64url 与 transport 元数据。

本包不执行加密。Mobile 与 Desktop 提供经过独立评审的端到端通道，再在 Relay 转发前加密版本 offer 和已编码 Companion 消息。[无密钥 assembled example](../../../examples/remote-protocol/start.ts)使用仅限示例的 AES-GCM adapter，证明 composition 与 Relay 仅见密文；它不是产品密码实现或安全评审结论。产品集成仍受[独立 Noise 评审](../../../docs/security/noise-cross-runtime-proof.md)约束。

## 模型体验

无，因为 Remote Protocol 元数据与设备来源永不进入模型请求。

#### KV Cache 影响

无。

## 已知限制与延后工作

- 当前 Companion catalog 只证明一个 mutation 与一个 projection；discovery、creation、interaction、attachment、cancellation 和 operation receipt 消息必须在后续协议扩展中加入，adapter 才能暴露它们。
- 配对 handshake、路由凭据、challenge lifecycle、加密 blob capability 与生产加密属于后续经评审的集成，不属于这些 codec。
