# Agent Note: Mount a local two-instance companion Platform for product clients

Status: implemented

[English](2026-08-21-local-companion-platform.md) | 中文

## Problem

生产 Platform 监听挂载 Account HTTP 并迁移 Remote Access 表，但配对 HTTP 与 Relay WSS 在独立 Noise 评审完成前保持未挂载。已有的无密钥组装夹具能在进程内证明配对和双实例 Relay，可 Mobile 与 Desktop 产品入口仍缺少一个共享受信任 HTTPS origin、真实 Account 会话和非粘性 TLS 前端的环回组成。当 Capacitor Browser 不存在时，模拟器浏览器也无法完成 GitHub 登录，除非仍有效的待完成登录能在当前浏览上下文导航后恢复。

## Decision

[`examples/local-companion-platform`](../../../../examples/local-companion-platform/README.md) 是长期运行的开发监听。它绑定一个 `127.0.0.1` TLS 端点，把 `/v1/*` 和 Relay 升级在两个进程内实例间轮换，并共享内存中的 Account、配对权威和 Relay 路由存储。所选开发身份就是该 TLS origin；生产身份仍是已运营的 `www.gestaltrun.com` 对，以便客户端成对校验拒绝共享身份。该组成里的 GitHub 授权是同一 origin 上的 `/v1/account/oauth/github/development-complete`，并始终给出 `octocat` 公开身份。`LOCAL_COMPANION_PAGE_ORIGIN` 把非 `/v1` 路径反代到 Mobile Vite，使浏览上下文可以共享 TLS origin；当 WebView 无法信任捆绑证书时，TLS 前端会把该 Vite origin 改写为所选 HTTPS origin，以满足 Account 与配对 CORS。[`apps/platform/src/boot.ts`](../../../../apps/platform/src/boot.ts) 不导入该示例，也不导入 `DevelopmentKeylessPairingHandshakeProvider`。

当没有会话时，`PlatformAccountInstallation.load()` 会把仍有效的待完成登录恢复为轮询，并清除过期的待完成尝试。非原生 Mobile 入口会对已准备的授权 URL 执行 `location.assign`，以便返回后由 `load()` 继续；只有打包后的 Capacitor WebView 才使用 `Browser.open`。入口仍然没有 `window.open`、弹窗或携带令牌的自定义 URL 回退。Account 与 Remote Access 的默认 Fetch 实现绑定到全局，以便浏览器调用。

Loader 场景使用顺序熵，以及真实的 Desktop/Mobile Account 客户端与 Remote Access HTTP/WSS 客户端，证明同账号登录、默认关闭的手机访问、确认后的配对，以及一次加密 Relay 往返。

## Alternatives considered

**在生产监听上挂载配对和 Relay。** 这会把未经评审的握手送到已运营 origin。生产进程保持 fail-closed。

**让 Mobile 指向 `http://127.0.0.1` 并改写 fetch。** Account 与 Remote Access HTTP 只允许所选 HTTPS origin。TLS 前端加上同 origin 页面反代，才能让 CORS 和配对链接保持诚实。

**只把待完成登录留在进程内存。** 同一窗口授权会丢掉五分钟尝试。恢复持久的待完成状态是产品恢复路径，而不是测试钩子。

## Consequences

开发者可以拉起一个环回 origin，供 Mobile 模拟器和 Desktop 无密钥标志使用，而不需要第二套云上 Platform。代价是未经评审的握手、内存存储和捆绑测试证书：该监听不是生产环境，也不能替代 Noise 评审、SLS 或 TestFlight/APK 验收。交叉引用：[双实例 Relay](2026-08-18-stateless-two-instance-remote-relay.md)，[无密钥配对验收](../testing/2026-08-19-personal-pairing-assembled-acceptance.md)。

## 测试

[`examples/local-companion-platform/tests/local-companion-platform.spec.ts`](../../../../examples/local-companion-platform/tests/local-companion-platform.spec.ts) 通过 Loader 启动真实 `cordis.yml`，并断言组装后的 transcript 以及对生产监听隔离的 grep。[`packages/platform/platform-account-client/tests/installation.client.spec.ts`](../../../../packages/platform/platform-account-client/tests/installation.client.spec.ts) 恢复或清除持久的待完成登录。[`apps/mobile/tests/mobile-entry.spec.ts`](../../../../apps/mobile/tests/mobile-entry.spec.ts) 在 Capacitor Browser 不可用时导航当前浏览上下文。
