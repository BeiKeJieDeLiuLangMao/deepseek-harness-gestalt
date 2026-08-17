# DeepSeek Gestalt Mobile

[English](README.md) | 中文

这是当前安装的 Mobile 账号 shell。它在 GitHub 授权前展示中英文数据保留说明，在应用外打开授权，以 P-256 证明轮询 Platform，只恢复经服务端确认的账号会话，并在不删除个人配对的前提下退出当前安装。

构建通过 `VITE_PLATFORM_ENV`（`development` 或 `production`）选择唯一身份环境，同时从 `VITE_PLATFORM_DEVELOPMENT_ORIGIN` 和 `VITE_PLATFORM_PRODUCTION_ORIGIN` 获取两个互不相同的 HTTPS origin。原生打包拥有系统浏览器适配器和稳定 WebView origin；浏览器开发入口使用 `window.open` 与 IndexedDB。

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## 已知限制与暂缓事项

- 本 shell 不包含个人配对、远程访问、推送或附件流程。
- 原生 iOS/Android 打包不属于本 ticket；仓库内应用是共用 WebView 呈现与账号生命周期。
