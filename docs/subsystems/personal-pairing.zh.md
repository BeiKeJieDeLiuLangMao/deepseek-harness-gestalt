# Personal Pairing

[English](personal-pairing.md) | 中文

[`@deepseek-ai/dsh-remote-access`](../../packages/platform/remote-access/README.md) 拥有 Mobile Access enablement、Pairing Challenge consumption、pending handshake confirmation、Personal Pairing identity 与 Companion-only Device Principal authority。它调用 `ctx.platformAccount.current()` 完成 Desktop 与 Mobile authorization 并比较 opaque Platform Account id；它从不读取 Account storage 或 GitHub fields。

## Challenge and confirmation lifecycle

每个 Desktop Installation 的 Mobile Access 都默认为 false，直到 Desktop Settings owner 开启。已开启的 Desktop 创建一项 challenge，其中包含 32-byte invitation capability、Desktop fingerprint、rendezvous id、两分钟 expiry 与 protocol major。QR 与完整链接 presentation 编码同一个 HTTPS value。不存在 short-code parser 或 fallback。

Mobile completion 只在完整链接与保留 capability 相符后消费 invitation。cross-account attempt 会在 crypto adapter 运行前销毁该 invitation。有效的同账号 handshake 生成 pending key 与 handshake hash；六个派生 authentication words 会出现在两个 Installation 上，但 active pairing list 在 Desktop 确认前保持为空。确认会激活唯一且由 provider 拥有的 key reference，并授予 branded Device Principal，其 authority 严格等于 `companion-surface`。

Mutation 串行执行。expiry、cancel、reject、disablement 与一次成功 completion 都会在另一 mutation 能观察前移除 capability。重复同一 completion 或 confirmation id 会返回首次提交结果；竞争 id 无法复用 invitation。

## Cryptographic adapter

`PairingHandshakeProvider` 准备、完成、激活并销毁 provider-private handshake state。Remote Access 从不实现 Noise transition 或 cryptographic primitive。assembled keyless adapter 只证明 lifecycle behavior。Desktop 与 Mobile 产品 composition 会把独立 Noise review 报告为 unavailable，并保持 Mobile Access 关闭，直到提供经过评审的 adapter。

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

Source: [`packages/platform/remote-access/src/index.ts:198`](../../packages/platform/remote-access/src/index.ts)
<!-- END GENERATED cordis-surface -->
