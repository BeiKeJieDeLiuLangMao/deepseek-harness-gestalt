# Agent Note: 产品 Snow 个人配对握手

Status: implemented

[English](2026-08-21-snow-product-handshake.md) | 中文

## Problem

生产 listen 已迁移个人配对与 Relay 表，但配对 HTTP 与 Relay WSS 仍未挂载。Desktop 与 Mobile 产品入口保持 fail-closed。已提交的 Snow 0.10.0 proof 不是产品适配器：它没有 `PairingHandshakeProvider`，且 XKpsk3 需要三条消息，而 complete-challenge HTTP 只有一次 Mobile 请求。

## Decision

产品负责人 `BeiKeJieDeLiuLangMao` 于 2026-08-21 以「PASS，可以推进」授权把已提交的 Snow 0.10.0 路径接入产品。本记录是负责人授权，不是第二评审人的所属机构、工具版本或向量出处表单。

[`@deepseek-ai/dsh-noise-channel`](../../../../packages/platform/noise-channel/README.md) 是薄 Snow 适配层。它用 Snow 生成 Desktop 静态与临时密钥，把私钥写入 challenge state，并在任一实例上用 Snow 文档中的 `fixed_ephemeral_key_for_testing_only` 重建 responder。邀请链接携带 `spk`（32 字节 Desktop 公钥）。`completeChallenge` 消费第 1 条消息并返回第 2 条；Desktop 不列出该 pending。`finishChallenge` 消费第 3 条消息，把完成后的握手哈希写成配对密钥，并发布认证词。`DevelopmentKeylessPairingHandshakeProvider` 仍仅用于开发。

[`apps/platform/src/boot.ts`](../../../../apps/platform/src/boot.ts) 用 `SnowPairingHandshakeProvider` 挂载 `PersonalPairingProvider`，在现有 PostgreSQL 存储与独立 Redis coordinator 上挂载 `RemoteRelayProvider`，并挂配对 HTTP 与 `/v1/remote-access/relay` 的 Relay WSS。Relay 可调项是必需的 `PLATFORM_RELAY_*` Environment 名。生产 Desktop 与 Mobile 选择真实配对 HTTP 与 WSS 控制器；开发仍要求无密钥开关。

## Alternatives considered

**在生产 listen 挂载 `DevelopmentKeylessPairingHandshakeProvider`。** 否决：无密钥 SHA-256 仍是开发组成。负责人 PASS 接纳的是 Snow，不是无密钥。

**把首次配对改成 IKpsk2，使一次 HTTP 往返完成握手。** 否决：proof 接纳的是 XKpsk3。额外的 `finish-challenge` 操作在现有邀请 HTTP 上保留该协议。

**只把 HandshakeState 留在进程内存。** 否决：负载均衡非粘性。持久 challenge state 加 Snow 重建才是双实例路径。

**把这次对话 PASS 当成已填完的独立评审清单。** 否决：proof 文档仍描述该清单。本笔记记录负责人授权以便产品代码挂载；它不编造评审人所属。

## Consequences

在 Environment `production` 写入新的 Relay 可调项并在之后显式 apply 镜像后，已运营的 `www.gestaltrun.com` 可以完成个人配对。Companion 应用帧在接入配对密钥 HKDF 之前仍使用开发 AES-GCM 封装。WSS 附着尚未组装 IK 重连。X25519 仍在 WASM 进程内存中运行。

## Testing

[`packages/platform/noise-channel/tests/handshake.spec.ts`](../../../../packages/platform/noise-channel/tests/handshake.spec.ts) 在 Mobile 与重建的 responder 之间完成 XKpsk3，并打开已封装的 Relay grant。[`apps/platform/tests/production-env.spec.ts`](../../../../apps/platform/tests/production-env.spec.ts) 钉死 listen 导入 Snow 且拒绝 `DevelopmentKeylessPairingHandshakeProvider`。
