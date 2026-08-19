# Agent Note: Keyless Personal Pairing assembled acceptance

Status: implemented

[English](2026-08-19-personal-pairing-assembled-acceptance.md) | 中文

## Problem

同账号个人配对已作为产品代码落地，但 #31 仍缺少通过真实 Loader 组合的组装验收。可信 origin、GitHub OAuth 与在线 Platform 都不可用，因此不能把部署侧配对当作所需证据。桩握手也无法证明 Desktop、Mobile 与 Platform 对同一把独立配对密钥达成一致。

## Decision

#31 的组装证据是无 Noise 握手 / SHA-256 开发派生且可在本地运行的。`DevelopmentKeylessPairingHandshakeProvider` 是该路径上唯一的握手适配器：每个对等端都用 SHA-256 从邀请密钥派生同一把 256 位密钥，生产组合永远不会导入或选择它。Loader 示例与 Desktop 组装控制器测试启动真实 `cordis.yml`、环回 HTTP 消费方，以及 Host 拥有的 Desktop 与 Mobile 控制器。它们证明 Mobile Access 默认关闭、跨账号完成会在授予设备主体之前失败、QR 与完整一次性链接相同、两端显示同一组认证词、必须由 Desktop 确认、已确认配对持有 32 字节独立密钥且只有 `companion-surface` 权限、已结算挑战上的第二个 completion id 得到 `PAIRING_CHALLENGE_INVALID`、相同 completion id 幂等、完成在 `expiresAt - 1` 成功、控制器在截止时刻本地拒绝链接，以及 `transport.completeChallenge` 在 `expiresAt` 得到 `PAIRING_CHALLENGE_EXPIRED`。

Desktop 放置证据把 `ui-settings-general` 的真实 Settings 外壳与 `ui-desktop` 一起挂载，并通过 slot 注册表上的 `entry.component` 渲染每个 Settings 分区。在 `zh-CN` 下，导航文案是 `通用设置` 与 `手机配对`；`AccountControl` 只注册在 `settings.section` id `mobile-pairing`；Mobile Access 只出现在该分区。本测试不挂载 conversation 或 workspace 插件。

## Alternatives considered

**等待可信 origin 与 GitHub OAuth。** 那仍是 #27 的生产验收路径，但本 ticket 拿不到。无 Noise 握手 / SHA-256 开发派生 Loader 证据是本地替代，并不声称产品密码学已经交付。

**保留全零桩握手。** 控制器与 HTTP 会继续绿灯，但 Desktop 与 Mobile 可能对密钥材料不一致。显式 SHA-256 适配器让密钥一致可观察。

**只在单独渲染的 `AccountControl` 上断言 Mobile Access。** 这会漏掉 Settings 外壳放置规则。外壳测试占用真实 `settings.section` 账本，实例化每个已注册分区组件，并切换导航行。

## Consequences

#31 可以在没有开发 Platform 的情况下，凭无 Noise 握手 / SHA-256 开发派生 Loader 与 Settings 外壳证据关闭。部署拥有的 origin、OAuth、双实例与托管存储仍归 #27。无 Noise 握手 / SHA-256 开发派生适配器仍未经评审，必须远离生产路径。精确 TTL 边界同时钉在提供方单元测试与组装控制器路径中。
