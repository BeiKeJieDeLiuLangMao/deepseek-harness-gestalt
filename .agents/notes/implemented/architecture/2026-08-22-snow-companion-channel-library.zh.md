# Agent Note: Snow Companion channel library

Status: implemented

[English](2026-08-22-snow-companion-channel-library.md) | 中文

## 问题

已选 Snow proof 会执行 XKpsk3 与 IK，但只暴露稳定报告。Personal Pairing 需要可复用的端点库，同时不能把公开的握手哈希当作秘密、不能用无关的 AES-GCM 构造包装 Relay authority，也不能把无类型字节接纳为 Foreground Synchronization。如果 Platform 持有 Desktop 或 Mobile 私钥，产品 composition 同样不能声称端到端加密。

## 决策

`@deepseek-ai/dsh-noise-channel` 把锁定的 Snow 0.10.0 编译为一个已提交的 WebAssembly 模块。XKpsk3 完成三条消息，并使用其 responder transport state 密封 Mobile Relay grant。握手哈希只提供认证词。grant 转换后，每个端点保留本端静态密钥与已认证的对端静态公钥；邀请 PSK、临时密钥与 transcript 状态都会清零。

每条物理 Relay attachment 都用 Snow 生成的新临时密钥建立新的 IK 握手。其 prologue 绑定 Relay route、非秘密 Personal Pairing selector、相互独立的 Desktop 与 Mobile attachment id，以及 connection generation。所得有序 transport 只加密版本化 Encrypted Companion Protocol 值。Foreground Synchronization 是带有正数 connection generation 与 Desktop revision 的 `foreground-sync` projection。

每条 Mobile Relay credential 记录都会在 credential digest 旁绑定其 pairing selector。credential 认证完成后，Relay `ready` 会投影 route、本端 attachment，以及当前对端 attachment、selector 与 connection generation。generation 从两个临时 directory connection token、route 与 selector 派生。Platform 只看到既有的不透明路由 metadata 和非秘密 selector；所投影对端是否持有已配对端点密钥，仍由 Snow static authentication 判定。

Mobile 生产入口会选择端点自有的 IK owner，并且只有该 owner 完成后才接纳 Companion 消息。Desktop 继续 fail-closed，因为当前 HTTP pairing provider 仍在 Platform 上持有 Desktop static state；挂载该 provider 会把 Platform 中介加密误称为端到端加密。Desktop 生产入口选择 responder 之前，必须用 Desktop 自有的持久 pairing state 和首次配对消息路径替换该 provider。

非粘性 XKpsk3 HTTP 状态转换通过 `fixed_ephemeral_key_for_testing_only`，使用 Snow 生成且只使用一次的临时密钥重建 Snow 状态。这一确切用法、生成的 binding 与已提交 WASM 仍属于独立审查范围。

## 考虑过的替代方案

**把 XKpsk3 握手哈希用作配对密钥材料。** 拒绝，因为 transcript hash 会认证交换，但不是秘密 transport key。

**用在 Snow 外派生的另一把 Web Crypto AES-GCM 密钥密封 Relay authority。** 拒绝，因为这会另建应用 cipher 与密钥派生构造，而不是使用受审查的 Noise transport。

**把 Snow provider 挂载到 Platform 并把结果称为端到端加密。** 拒绝，因为 Platform 会持有端点私有状态，并能派生 Companion channel。

**保留 1 字节同步信号。** 拒绝，因为一个字节没有应用版本、认证字段、Desktop revision 或 connection-generation binding。

## 后果

仓库具备可执行的 XKpsk3 grant 密封、credential-bound peer projection、attachment-bound fresh IK、重放与乱序拒绝、route/selector/attachment transcript 拒绝，以及不依赖第二套应用 cipher 的版本化认证同步。Remote Access 也支持幂等的第三条握手消息，并在它完成前阻止 Desktop 确认。产品激活仍依赖 Desktop 端点所有权、原生持久存储、物理设备证据与针对确切适配器的独立审查；本地 package tests 与现有 proof 不满足这些 release 条件。
