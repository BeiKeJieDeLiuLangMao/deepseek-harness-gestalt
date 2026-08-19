# DeepSeek Gestalt Mobile

[English](README.md) | 中文

这是当前安装的 Mobile 账号与个人配对 shell。它在 GitHub 授权前展示中英文数据保留说明，在应用外打开授权，以 P-256 证明轮询 Platform，只恢复经服务端确认的账号会话，并在不删除个人配对的前提下退出当前安装。登录后，配对控制器会把粘贴或原生 QR 扫描器得到的完整一次性链接送入同一条已鉴权远程访问传输，显示认证词，并轮询由 Mobile 拥有的待确认 id，直到 Desktop 明确确认后才显示已配对状态。确认结果携带由配对密钥密封的 Mobile 专用 Relay authority；Mobile 密码适配器解封该 authority 并启动有界 WSS 生命周期，且不会收到 Desktop credential。

入口会在渲染前校验完整的开发与生产身份对：两侧分别通过 `VITE_PLATFORM_DEVELOPMENT_*` 或 `VITE_PLATFORM_PRODUCTION_*` 前缀提供 `ORIGIN`、`CALLBACK_URL`、`GITHUB_CLIENT_ID`、`CREDENTIAL_REFERENCE`、`DATABASE_IDENTITY` 和 `IDENTITY_NAMESPACE`，再由 `VITE_PLATFORM_ENV` 显式选择一侧。成对字段必须全部不同；缺失、未知、共享、非 HTTPS 或回调不匹配的配置会在渲染和网络流量前失败。

共用 Mobile 入口内置 `@capacitor/browser` 适配器，并在授权尝试准备完成后由继续按钮的用户激活直接调用。入口没有 `window.open`、弹窗或携带令牌的自定义 URL 回退。`IndexedDbInstallationAccountStore` 将所选数据库身份写入数据库名；原生打包负责提供稳定 WebView origin。

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## 已知限制与暂缓事项

- 生产配对在独立 Noise 评审接纳经过评审的握手提供方前保持不可用。只有所选 Platform 环境为开发环境时，`VITE_PERSONAL_PAIRING_KEYLESS=1` 才会选择真实开发控制器与明确标记为未评审的 keyless Mobile 握手。该模式还要求 `VITE_REMOTE_RELAY_WSS_URL`、`VITE_REMOTE_RELAY_ATTACH_TIMEOUT_MS`、`VITE_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS`、`VITE_REMOTE_RELAY_RECONNECT_DELAY_MS`、`VITE_REMOTE_RELAY_INBOUND_MAX_BYTES` 和 `VITE_REMOTE_RELAY_INBOUND_MAX_MESSAGES`；所有字段都在应用渲染前完成校验。
- Remote Companion traffic、推送与附件 flow 不在此 shell 范围内。
- 原生 iOS/Android 工程生成与设备打包不属于本 shell；仓库内 composition 已包含 Capacitor 系统浏览器适配器与共用 WebView 账号生命周期。
