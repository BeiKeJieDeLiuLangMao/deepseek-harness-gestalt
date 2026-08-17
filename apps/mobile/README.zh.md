# DeepSeek Gestalt Mobile

[English](README.md) | 中文

这是当前安装的 Mobile 账号 shell。它在 GitHub 授权前展示中英文数据保留说明，在应用外打开授权，以 P-256 证明轮询 Platform，只恢复经服务端确认的账号会话，并在不删除个人配对的前提下退出当前安装。

入口会在渲染前校验完整的开发与生产身份对：两侧分别通过 `VITE_PLATFORM_DEVELOPMENT_*` 或 `VITE_PLATFORM_PRODUCTION_*` 前缀提供 `ORIGIN`、`CALLBACK_URL`、`GITHUB_CLIENT_ID`、`CREDENTIAL_REFERENCE`、`DATABASE_IDENTITY` 和 `IDENTITY_NAMESPACE`，再由 `VITE_PLATFORM_ENV` 显式选择一侧。成对字段必须全部不同；缺失、未知、共享、非 HTTPS 或回调不匹配的配置会在渲染和网络流量前失败。

共用 Mobile 入口内置 `@capacitor/browser` 适配器，并在授权尝试准备完成后由继续按钮的用户激活直接调用。入口没有 `window.open`、弹窗或携带令牌的自定义 URL 回退。`IndexedDbInstallationAccountStore` 将所选数据库身份写入数据库名；原生打包负责提供稳定 WebView origin。

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## 已知限制与暂缓事项

- 本 shell 不包含个人配对、远程访问、推送或附件流程。
- 原生 iOS/Android 工程生成与设备打包不属于本 shell；仓库内 composition 已包含 Capacitor 系统浏览器适配器与共用 WebView 账号生命周期。
