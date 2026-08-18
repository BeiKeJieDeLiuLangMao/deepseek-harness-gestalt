# 个人配对

[English](personal-pairing.md) | 中文

[`@deepseek-ai/dsh-remote-access`](../../packages/platform/remote-access/README.md) 拥有手机访问开关、配对挑战消费、待确认握手确认、个人配对身份与仅限 Companion 的设备主体权限。它调用 `ctx.platformAccount.currentInstallation()` 鉴别每个账号会话的安装 id 与类型，再比较不透明的平台账号 id；它从不读取账号存储或 GitHub 字段，也不信任调用方自行提供的安装身份。

## 挑战与确认生命周期

每个 Desktop 安装的手机访问都默认为关闭，直到 Desktop 设置所有者开启。已开启的 Desktop 创建一项挑战，其中包含 32 字节邀请能力、Desktop 指纹、rendezvous id、两分钟过期时间与协议主版本。QR 与完整链接展示编码同一个 HTTPS 值。不存在短码解析器或回退路径。

Mobile 仅在完整链接与保留能力相符后消费邀请。跨账号尝试会在密码适配器运行前销毁邀请。有效的同账号握手生成待确认密钥与握手哈希；六个派生认证词会出现在两个安装上，但活跃配对列表在 Desktop 确认前保持为空。确认会激活唯一且由提供方拥有的密钥引用，并授予带品牌的设备主体，其权限严格等于 `companion-surface`。

变更串行执行。过期、取消、拒绝、关闭手机访问与一次成功完成都会先提交终态，使另一项变更无法再观察该能力。密码资源销毁可以独立重试：清理失败不会重复完成握手或激活配对，提供方释放资源时会尝试处理每项挑战、待确认密钥、活跃密钥与清理记录。挑战创建时就调度过期任务，不会等待另一项完成请求。不透明生成 id 与已激活密钥引用都会在插入前判重，因此碰撞不能覆盖既有记录，也不能遗弃新分配的密钥。

## 密码适配器

`PairingHandshakeProvider` 准备、完成、激活并销毁提供方私有握手状态。远程访问从不实现 Noise 状态迁移或密码原语。`remote-access-http` 消费 `ctx.remoteAccess`，`remote-access-client` 则校验真实 Desktop 设置与 Mobile 控制器使用的协议值。组装后的 loader 场景使用明确标记为未评审的 keyless 提供方，让提供方、HTTP 消费方和共享传输通过真实环回服务器运行。Desktop 与 Mobile 开发入口只能通过显式标志选择各自的真实控制器。生产组合在独立 Noise 评审接纳经过评审的提供方前保持不可用；开发证明永远不会由生产路径选择。

## 多实例 Relay

`ctx.remoteRelay` 使用不透明 route id 与独立可轮换的 32 字节凭据鉴权 attachment，通过 `RelayRouteStore` 只持久化其 digest 与 revision，并将在线 attachment 注册到会过期的共享目录。`remote-access-redis` 只承载目录元数据、不含内容的失效通知与有界密文 Pub/Sub；它不创建离线 queue。位于另一 Platform Instance 的目标会收到同一个不透明 Relay frame，目标缺失则立即返回 `REMOTE_OFFLINE`。

Mobile 与 Desktop 通过一个 non-sticky TLS endpoint 向外连接。实例丢失会建立新连接；Desktop 在 attachment 后发送权威加密 projection，不迁移在线 socket。关闭 Desktop 窗口会退出进程，sleep、quit、退出账号或关闭手机访问都会停止 Relay。在组装经过评审的产品密码能力前，生产保持 fail-closed。无密钥双实例 Loader 场景只证明 transport 组合，不会削弱该 gate。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxremoteaccess--remoteaccessservice-abstract-seam"></a>

### `ctx.remoteAccess` — `RemoteAccessService` (abstract seam)

Remote Access capability owning the complete Personal Pairing lifecycle.

```ts cordis-catalog
/**
 * Create one two-minute invitation for a signed-in Desktop Installation.
 * @param input - Desktop authorization and opaque rendezvous identity.
 * @returns complete QR/link projection; no low-entropy fallback exists.
 */
abstract createChallenge(input: { desktop: PairingAccountAuthentication rendezvousId: PairingRendezvousId }): Promise<PairingChallengeView>

/**
 * Read the current Desktop Installation's Mobile Access state.
 * @param desktop - current Desktop authorization.
 * @returns whether Settings has enabled Mobile Access for this Installation.
 */
abstract getMobileAccessState(desktop: PairingAccountAuthentication): Promise<MobileAccessState>

/**
 * Set Mobile Access from the Desktop Settings owner.
 * @param input - current Desktop authorization and requested state.
 * @returns committed Mobile Access state.
 */
abstract setMobileAccess(input: { desktop: PairingAccountAuthentication enabled: boolean }): Promise<MobileAccessState>

/**
 * Complete the same-account cryptographic exchange without granting authority.
 * @param input - Mobile authorization, invitation, device metadata, and handshake bytes.
 * @returns pending result shown on both installations before Desktop confirmation.
 */
abstract completeChallenge(input: { mobile: PairingAccountAuthentication completionId: PairingCompletionId oneTimeLink: string device: PairingDeviceDescription mobileHandshake: Uint8Array }): Promise<PairingCompletionView>

/**
 * Read the decision for one pairing completed by the current Mobile Installation.
 * @param input - current Mobile authorization and pending identity.
 * @returns pending, paired, or rejected without exposing Desktop authority.
 */
abstract getMobilePairingStatus(input: { mobile: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<MobilePairingStatus>

/**
 * List active pairings visible to one signed-in Desktop Account.
 * @param desktop - current Desktop Account authorization.
 * @returns only confirmed pairings; pending handshakes are excluded.
 */
abstract listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]>

/**
 * List completed handshakes awaiting this Desktop Installation's decision.
 * @param desktop - current Desktop authorization.
 * @returns pending handshakes owned by this Desktop Installation.
 */
abstract listPendingPairings(desktop: PairingAccountAuthentication): Promise<readonly PairingCompletionView[]>

/**
 * Activate one pending pairing after the Desktop user compares authentication words.
 * @param input - confirming Desktop and pending identity.
 * @returns independently keyed Companion-only Device Principal.
 */
abstract confirmPairing(input: { desktop: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<PersonalPairingView>

/**
 * Cancel one active invitation; repeated cancellation is a no-op.
 * @param input - owning Desktop authorization and challenge identity.
 */
abstract cancelChallenge(input: { desktop: PairingAccountAuthentication challengeId: PairingChallengeId }): Promise<void>

/**
 * Reject one pending handshake; repeated rejection is a no-op.
 * @param input - owning Desktop authorization and pending identity.
 */
abstract rejectPairing(input: { desktop: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<void>
```

Source: [`packages/platform/remote-access/src/index.ts:234`](../../packages/platform/remote-access/src/index.ts)

<a id="ctxremoterelay--remoterelayservice-abstract-seam"></a>

### `ctx.remoteRelay` — `RemoteRelayService` (abstract seam)

Public Remote Access Relay capability used by the WSS Consumer.

```ts cordis-catalog
/**
 * Rotate one route to fresh authority and invalidate older attachments.
 * @param routeId - opaque route receiving new attachment authority.
 * @returns the one-time credential grant and its persistent revision.
 */
abstract rotateCredential(routeId: RelayRouteId): Promise<RelayCredentialGrant>

/**
 * Revoke one route and close its attachments across Platform Instances.
 * @param routeId - opaque route whose current authority becomes invalid.
 */
abstract revokeRoute(routeId: RelayRouteId): Promise<void>

/**
 * Authenticate and register one outbound Mobile or Desktop attachment.
 * @param input - attach frame plus the socket writer and optional close callback.
 * @returns the admitted attachment receiving later frames from that socket.
 */
abstract attach(input: { message: RelayAttachMessage deliver: (message: RelayCiphertextMessage) => Promise<void> close?: () => void | Promise<void> }): Promise<RemoteRelayAttachment>
```

Source: [`packages/platform/remote-access/src/relay.ts:116`](../../packages/platform/remote-access/src/relay.ts)
<!-- END GENERATED cordis-surface -->
