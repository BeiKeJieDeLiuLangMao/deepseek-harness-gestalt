# `@deepseek-ai/dsh-noise-channel`

[English](README.md) | 中文

产品 Snow 0.10.0 适配层，用于个人配对。该 crate 只配置 Snow、驱动带 prologue `dsh-mobile-companion-v1` 的 `Noise_XKpsk3_25519_ChaChaPoly_SHA256` 并判定结果。它不实现 Noise token、X25519、ChaChaPoly、SHA-256，也不另写一套握手。临时私钥由 Snow 生成并写入 challenge state，以便非粘性 Platform Instance 重建 responder；重建使用 Snow 文档中的 `fixed_ephemeral_key_for_testing_only`，密钥仍是上述生成值。

`SnowPairingHandshakeProvider` 实现 `PairingHandshakeProvider`。`createChallenge` 返回 Desktop fingerprint 以及写入邀请 `spk` 查询的 32 字节 Desktop 静态公钥。`completeChallenge` 消费 Mobile 第 1 条消息并返回第 2 条消息与未完成 pending state。`finishChallenge` 消费第 3 条消息，把该 state 替换为完成后的 32 字节握手哈希，即配对密钥。`sealMobileRelayAuthority` 用该哈希以 AES-GCM 封装 Mobile Relay grant。

`SnowMobileHandshakeClient` 是 Mobile 半边：`begin` 写出第 1 条消息，`acceptDesktopHandshake` 写出第 3 条，`exportFinishMessage` 提供 `finish-challenge` HTTP 正文，`openRelayAuthority` 打开已封装 grant。

已提交的 WebAssembly 模块位于 `pkg/`，并以 `./snow-wasm` 导出。Node 先加载该包路径上的二进制，再尝试捆绑 listen 入口旁的同名 `dsh_noise_channel_bg.wasm`。浏览器消费方获取同一 `pkg/dsh_noise_channel_bg.wasm` URL。修改 Rust 适配层后用 `node packages/platform/noise-channel/rust/build.mjs` 重建，并在评审中保持 `pkg/` 字节一致。

## Model Experience

无，因为握手字节与配对密钥不会进入模型请求。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- Companion 应用帧仍使用现有开发 AES-GCM 封装，直到 Desktop 与 Mobile Relay 生命周期接入配对密钥 HKDF。
- WSS 附着尚未组装 IK 重连（`Noise_IK_25519_ChaChaPoly_SHA256`）。
- 尚未实现配对密钥的原生硬件封装静态存储。
