# Agent Note: Desktop 与 Mobile 的 GitHub 登录组装级验收

Status: implemented

[English](2026-08-19-github-signin-assembled-acceptance.md) | 中文

## 问题

Issue #30 要求 Desktop 与 Mobile 都能用 GitHub 登录 Platform Account。客户端切片——`PlatformAccountInstallation`、`DesktopAccountController`、双语隐私说明、Mobile Account 页面和 HTTP 路由——已在 mobile-companion 基线就位，各自有基于伪造 transport 的单元测试。工单仍缺的是组装级证据：两个真实安装对同一个真实 Loader 组合的 Platform 通过 TCP 登录、真实安装上的账号切换、登出时的选择性失效、开发/生产身份命名空间隔离，以及 Desktop Host 控制器（加密存储、重启恢复、刷新轮换）驱动真实 HTTP 而非伪造 transport。

## 决策

不改动任何生产接缝，在工单点名的两个接缝上补齐 REAL 组合验收测试：

- `packages/platform/platform-account-http/tests/assembled.spec.ts` 现在用一个组合启动两个 `PlatformAccountInstallation` 客户端（desktop 与 mobile 类型、独立存储）。两者都完成 GitHub 授权；随后 desktop 安装切换到第三个 GitHub 身份，证明 Platform 只吊销被替换的会话（通过共享失效总线的第二个 `PlatformAccount` 的 `trackConnection` 观察），mobile 会话保持有效，且安装经由 `accountStorageNamespace` 获得新的账号命名空间。登出 desktop 安装只关闭它自己被跟踪的连接；mobile 会话存活到它自己登出。
- 同一文件在配对的生产侧（独立的 OAuth client id、callback、数据库、身份命名空间和令牌签名密钥）启动第二个组合，证明开发会话的访问令牌与 P-256 proof 在生产侧以 `SESSION_REVOKED` 被拒：身份命名空间互不相通。
- `apps/desktop/tests/platform-account-real.spec.ts` 用生产形态的 `DesktopAccountController`——`EncryptedDesktopAccountStore`、系统浏览器适配器、调度轮询——驱动真实 Loader + TCP Platform：同意门禁、签名轮询到达 `signed-in`、从加密记录重启恢复、十五分钟 TTL 后的访问令牌轮换，以及登出后记录回到 idle 且被吊销令牌被 Platform 拒绝。

## 备选方案

**再用一个伪造 transport 扩展 Desktop 单元套件。** 否决：工单重开的阻塞点是真实 Platform 上的组装验收，状态机已由伪造覆盖。

**两个 spec 文件共享一个 Loader 启动辅助函数。** 暂缓：`jscpd` 只扫描 `packages` 与 `scripts`，且 desktop 组合选择自己的环境对和直通 safeStorage 适配器；为两处调用提取跨应用测试辅助函数会让应用 spec 耦合包测试布局。

**也让 Mobile React 页面驱动真实组合。** 暂缓：`MobileAccount` 从 `PlatformAccountInstallation` 快照渲染，安装的真实 HTTP 生命周期已按两种安装类型完成组装覆盖；页面级行为测试覆盖渲染与同意门禁。

## 后果

Issue #30 的验收标准在本基线上有了可执行的无密钥证据：带同意门禁的双语说明、PKCE + 固定 HTTPS callback + 签名轮询（既有测试加双安装用例）、无 scope 授权 URL、十五分钟访问与轮换刷新的 P-256 会话、每次一账号的安装切换与隔离的材料命名空间、只失效本安装会话并跨 Platform 实例生效的登出，以及开发/生产命名空间隔离。未改变任何运行时行为；生产接线（`apps/platform/src/boot.ts`、Desktop Host、Mobile 入口）未动。

## 测试

`pnpm exec vitest run packages/platform/platform-account-http/tests/assembled.spec.ts apps/desktop/tests/platform-account-real.spec.ts`——五个组装用例加 Desktop Host 生命周期，全部通过回环 TCP 上的真实 Loader 组合 WebServer + PlatformAccount 与伪造 GitHub provider。既有单元套件（`apps/desktop/tests/platform-account.spec.ts`、`apps/mobile/tests/mobile-account.spec.ts`、`packages/platform/platform-account-client/tests/installation.client.spec.ts`）不变且仍通过。

## 关联

- Issue #30（父 spec #27）——Desktop 与 Mobile 的客户端 GitHub 登录。
- [Platform Account installation sessions](2026-08-17-platform-account-installation-sessions.md)——这些组合所执行的会话与 proof 设计。
- [Desktop Host ownership of the Account lifecycle](../architecture/2026-08-16-deepseek-gestalt-desktop-host.md)——Desktop Host 拥有系统浏览器授权与受保护的安装密钥。
