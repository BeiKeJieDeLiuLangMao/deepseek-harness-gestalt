# Platform 账号

[English](platform-account.md) | 中文

[`@deepseek-ai/dsh-platform-account`](../../packages/platform/platform-account/README.zh.md)定义 Platform 身份，以及绑定到一个 Desktop 或 Mobile 安装的持有证明账号会话。GitHub 只提供不可变的数字主体和当前公开登录名／头像；身份验证后会丢弃其 OAuth 令牌。

## Installation 身份

```ts type-equiv
/** Opaque identifier for one Desktop or Mobile app copy. */
type InstallationId = Branded<'InstallationId'>
```

## 登录与会话生命周期

Installation 在创建五分钟 `LoginAttemptView` 前接受唯一规范的双语隐私说明。Mobile 将 Device adapter 返回的名称及 iOS 或 Android 平台绑定到该 attempt，Platform 再把该展示随 Account Session 持久化；`currentInstallation()` 的调用方只有证明 Mobile Installation 密钥后才能获得它。Mobile 会先准备 attempt，再允许点击授权按钮；按钮的用户激活会直接调用 Capacitor Browser adapter，Desktop 则委托 Electron `shell.openExternal`。系统浏览器使用带 S256 PKCE、随机 state、无 OAuth scope 的 Authorization Code，并返回唯一固定的 HTTPS Platform 回调。应用不会收到回调凭证或携带 token 的自定义 URL；只有 P-256 `AccountProof` 兑换单次使用的签名轮询 token 后，`LoginPollResult` 才会完成。

`AccountSessionView` 包含 15 分钟访问令牌和有效期最多 30 天的轮换刷新令牌。只有完整 15 分钟访问期限能落在该绝对限制内时才接受刷新；过晚的请求会在消费证明或轮换令牌前被拒绝。当前账号读取、刷新和退出都通过品牌化的单次证明 JTI 来证明持有安装密钥。不透明 `AccountSessionId` 是 Platform 实例之间共享的失效身份。

## 所有权与隔离

一个安装只持有一个当前 Platform 账号。账号域配对密钥、缓存和操作回执使用包含环境与账号 id 的命名空间，因此切换账号会选择隔离的材料。一个串行 lifecycle owner 会依次处理恢复、刷新、登录、轮询、切换与退出，重复加载不能清除或复活较新的会话。Desktop 关闭时会关闭该 owner、排空已经接纳的轮询，并抑制 dispose 后的状态变更或发布。快照 listener 的错误会分别隔离。当前安装退出会提交会话失效，分别隔离错误并等待全部失效 listener 与连接 closer，同时保留个人配对。

通用能力可以为范围受限的 example 与测试校验彼此不同的开发和生产身份。Desktop 与 Mobile 产品入口会在渲染或流量前只接受一套实际运行的生产身份：Desktop 从应用 archive 读取发布流程生成的公开配置，Mobile 则通过构建配置接收同一组字段。该身份绑定 HTTP Consumer 唯一的 CORS origin、客户端 transport、OAuth adapter、backend 数据库、本地存储、回调与签发账号命名空间；字段缺失、localhost 或 Consumer origin 不匹配会在注册路由前失败。HTTP 与持久化记录都会在各自边界从 `unknown` 解析，IndexedDB 只接受真正的 P-256 私有签名 `CryptoKey`。内存后端与失效总线是 fixture adapter；生产持久化与分布式失效属于 Platform 部署。

## Desktop 管理 Mobile 安装

活跃 Desktop Account Session 可以列出所属 Account 的活跃 Mobile Installation，并远程退出一个与证明绑定的 opaque 目标。每行展示已认证 Mobile 信息和稳定的十二字符 Installation 摘要；缺少展示字段的旧记录仍可移除，也不会显示虚构身份。移除操作会原子提交全部匹配 Session 的撤销、refresh 移除和持久失效记录，同时消费同一 Account 中目标已经授权的 login attempt。Refresh 要么先于该事务提交，要么看到非活跃 Session。后续授权或登录仍可建立新 Session，因为移除不会创建 Installation 黑名单。

失效发布会分别尝试全部已提交 Session id，只确认总线接受的投递。由必填 `sessionInvalidationRetryIntervalMs` 驱动的 namespace 恢复定时器会在发布失败或进程重启后重复待投递 id，且不依赖账号删除。Outbox 记录在所属 Account 与 Session 行删除后仍会保留。

<a id="account-deletion"></a>

## 账号删除

`AccountDeletionRequest` 将客户端创建的操作 id、随机恢复令牌及明确的 `{projectId, successorMembershipId}` 选择绑定到发起 Installation 的证明。`AccountDeletionView` 返回 `deleting`、带已加入接任候选的 `action-required`，或 `complete`。`AccountDeletionRecovery` 仅允许查询和替换选择，不恢复已撤销的会话权限。Account 提供方在 owner 清理前持久化接受状态；Mobile 控制器在云端和本地清理均完成后才移除本地凭据。[删除决策](../../.agents/notes/implemented/feature/2026-09-09-mobile-account-deletion.zh.md)负责顺序和保留数据的限制。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplatformaccount--accountservice-abstract-seam"></a>

### `ctx.platformAccount` — `AccountService` (abstract seam)

Platform Account capability. Providers own OAuth, installation-key binding, token rotation, and current-installation invalidation behind this interface.

```ts cordis-catalog
/**
 * Start one GitHub Authorization Code attempt for an installation key.
 * @param input - installation identity, Mobile presentation when applicable, and public P-256 JWK.
 * @returns the system-browser URL and signed polling capability.
 * @throws AccountError `PLATFORM_CAPACITY` with `retryAfter` when the shared watermark is shedding.
 */
abstract beginLogin(input: InstallationLoginIdentity & { publicKey: JsonWebKey }): Promise<LoginAttemptView>

/**
 * Settle the fixed HTTPS GitHub callback; provider credentials never leave the provider.
 * @param input - GitHub authorization code and returned random state.
 * @returns completion marker suitable for a browser confirmation page.
 */
abstract completeGitHubCallback(input: { code: string; state: string }): Promise<{ completed: true }>

/**
 * Poll one attempt using both its signed polling token and installation proof.
 * Completing a new Installation is rejected at the tenth-plus-one live Desktop or Mobile session for that Account.
 * @param input - attempt binding and one-use proof.
 * @returns pending or the newly created Account Session.
 * @throws AccountError `QUOTA` or `PLATFORM_CAPACITY` with `retryAfter` seconds.
 */
abstract pollLogin(input: { attemptId: LoginAttemptId pollingToken: string proof: AccountProof }): Promise<LoginPollResult>

/**
 * Rotate a current installation's refresh token and issue a new access token.
 * @param input - current refresh token and installation proof.
 * @returns replacement tokens retaining the original absolute refresh expiry.
 */
abstract refresh(input: { refreshToken: string; proof: AccountProof }): Promise<AccountSessionView>

/**
 * Read the current installation account.
 * @param input - access token and installation proof.
 * @returns current account projection.
 */
abstract current(input: { accessToken: string; proof: AccountProof }): Promise<PlatformAccountView>

/**
 * Authenticate the Account and Installation identity bound to one current session.
 * @param input - access token and proof from the session's Installation key.
 * @returns provider-owned Account and Installation identity, including authenticated Mobile presentation.
 */
abstract currentInstallation(input: { accessToken: string proof: AccountProof }): Promise<AuthenticatedInstallationView>

/**
 * List active Mobile Installations owned by the calling Desktop's Account.
 * @param input - Desktop Account access token and proof bound to this list operation.
 * @returns authenticated presentation plus an opaque removal target and display reference.
 */
abstract listMobileInstallations(input: { accessToken: string proof: AccountProof }): Promise<readonly MobileAccountInstallationView[]>

/**
 * Remotely sign one Mobile Installation out of the calling Desktop's Account.
 * @param input - Desktop authorization and proof bound to the opaque target Installation id.
 * @returns the active Mobile Installation list after durable revocation.
 */
abstract revokeMobileInstallation(input: { accessToken: string proof: AccountProof installationId: import('./types.ts').InstallationId }): Promise<readonly MobileAccountInstallationView[]>

/**
 * Read the public identity of many accounts in one batch.
 * @param accountIds - accounts to resolve, typically one roster.
 * @returns the public identity per known account; unknown accounts are absent.
 */
abstract publicIdentitiesByIds( accountIds: readonly PlatformAccountId[], ): Promise<ReadonlyMap<PlatformAccountId, PublicAccountIdentity>>

/**
 * Resolve one unambiguous current public GitHub login.
 * @param githubLogin - case-insensitive public login entered by an operator.
 * @returns the matching public Account identity, or undefined when absent or ambiguous.
 */
abstract publicIdentityByGithubLogin(githubLogin: string): Promise<PublicAccountIdentity | undefined>

/**
 * Inspect shared projects requiring explicit ownership successors.
 * @param input - Current Installation authorization.
 * @returns Projects requiring a successor selected from joined members.
 */
abstract planAccountDeletion(input: { accessToken: string; proof: AccountProof }): Promise<readonly AccountDeletionProject[]>

/**
 * Resume the initiating Installation's deletion without an Account Session.
 * @param input - Restricted recovery receipt and optional replacement choices.
 * @returns Durable progress or an explicit successor-selection requirement.
 */
abstract recoverAccountDeletion(input: AccountDeletionRecovery): Promise<AccountDeletionView>

/**
 * Delete this Account and invalidate every Installation.
 * @param input - Confirmed operation, recovery material and Installation proof.
 * @returns Durable deletion progress.
 */
abstract deleteAccount(input: AccountDeletionRequest): Promise<AccountDeletionView>

/**
 * Revoke only the current installation Account Session.
 * @param input - access token and installation proof.
 */
abstract signOut(input: { accessToken: string; proof: AccountProof }): Promise<void>

/**
 * Track a Platform connection so cross-instance session invalidation closes it.
 * Every admission checks durable session activity, including ids already cached for connection counting.
 * @param sessionId - Account Session owning the connection.
 * @param close - idempotent close callback.
 * @returns disposer removing the tracked connection.
 * @throws AccountError `QUOTA` with a 60-second `retryAfter` when the Account already has twenty tracked closers.
 * @throws AccountError `SESSION_REVOKED` when the session is missing or inactive.
 */
abstract trackConnection(sessionId: AccountSessionId, close: () => void | Promise<void>): Promise<() => void>
```

Source: [`packages/platform/platform-account/src/index.ts`](../../packages/platform/platform-account/src/index.ts)
<!-- END GENERATED cordis-surface -->
