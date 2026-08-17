# Agent Note: Settings-owned same-account Personal Pairing

Status: implemented

[English](2026-08-18-settings-personal-pairing.md) | 中文

## Problem

Platform Account 识别 Installation，但不会授予 Desktop authority。Personal Pairing 需要短期 capability、认证过的同账号 exchange、明确的人工比对与窄授权 Device Principal，同时不能把 Remote Access state 暴露到既有 Session Surface 各处。所选 Noise implementation 也仍受独立评审要求约束，因此 lifecycle delivery 不能把 proof-local dependency 静默变成产品密码实现。

## Decision

`@deepseek-ai/dsh-remote-access` 是拥有 Mobile Access 与 Personal Pairing lifecycle 的 Remote Access module。其 public service 通过 Platform Account service 验证两个 Installation Account Session，拥有 challenge/pending/confirmed state transition，串行执行 mutation，并且仅在 Desktop 确认后授予 `companion-surface` Device Principal。Branded id 区分 challenge、rendezvous、completion、pending pairing、Personal Pairing 与 Device Principal。

Desktop 与 Mobile 的 crypto behavior 通过 `PairingHandshakeProvider` 进入。lifecycle 向它传递全新的 32-byte invitation secret，在每个 terminal transition 销毁 provider-private state，仅从返回的 handshake hash 派生显示词，并要求 activation 使用唯一 key reference。keyless Loader composition 运行完整 state machine，但明确标识为未经评审的 proof。在独立 Snow review 接纳产品 adapter 前，产品 composition 保持 unavailable 与 disabled。

既有 Desktop `手机配对` Settings section 拥有 Mobile Access toggle、QR/完整链接 challenge、authentication words、confirm、reject 与 paired-device list。QR generation 使用维护中的 `qrcode` encoder。Mobile 接受同一个完整链接或 native QR payload，并等待 Desktop confirmation。不会注册新的 Session header、sidebar、approval、composer 或 offline presentation。

## Alternatives considered

**直接集成 proof-local Snow WebAssembly。** 这会越过独立评审要求，并把可复现 evidence 变成未经评审的产品 dependency。可替换 adapter 让产品 composition 保持 fail-closed。

**把 Platform Account identity 当作 Desktop authorization。** 这会折叠 identity 与 capability 边界。Remote Access 只在 pairing 期间比较 Account id，并创建使用独立 key、可独立 revoke 的 Device Principal。

**提供手输短码。** 低熵 fallback 会形成第二条更弱的协议。camera 与 non-camera flow 携带同一个完整 invitation link。

**把 pairing status 加到普通 Desktop chrome。** 常驻 Session UI 会把功能扩展到 Settings 以外并改变无关 offline 与 approval state。既有 Settings slot 是唯一 Desktop presentation owner。

## Consequences

公开 lifecycle 与真实 Settings/Mobile component 可以在不声称产品 encryption 的情况下接受 review 与 test。cross-account、expiry、cancel、reject、concurrency、retry、pre-confirmation 与 narrow-authority behavior 固定在同一 interface。Production pairing 仍被独立安全评审与 durable Platform adapter 阻挡；单进程 provider 与 keyless scenario 不是 deployment persistence 或 Relay implementation。
