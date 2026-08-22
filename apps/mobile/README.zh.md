# DeepSeek Gestalt Mobile

[English](README.md) | 中文

这是当前安装的 Mobile 账号与个人配对 shell。它在 GitHub 授权前展示中英文数据保留说明，在应用外打开授权，以 P-256 证明轮询 Platform，只恢复经服务端确认的账号会话，并在不删除个人配对的前提下退出当前安装。登录后，配对控制器会把粘贴或原生 QR 扫描器得到的完整一次性链接送入同一条已鉴权远程访问传输，显示认证词，并轮询由 Mobile 拥有的待确认 id，直到 Desktop 明确确认后才显示已配对状态。确认结果携带由配对密钥密封的 Mobile 专用 Relay authority；Mobile 密码适配器解封该 authority 并启动有界 WSS 生命周期，且不会收到 Desktop credential。

入口会在渲染前校验完整的开发与生产身份对：两侧分别通过 `VITE_PLATFORM_DEVELOPMENT_*` 或 `VITE_PLATFORM_PRODUCTION_*` 前缀提供 `ORIGIN`、`CALLBACK_URL`、`GITHUB_CLIENT_ID`、`CREDENTIAL_REFERENCE`、`DATABASE_IDENTITY` 和 `IDENTITY_NAMESPACE`，再由 `VITE_PLATFORM_ENV` 显式选择一侧。成对字段必须全部不同；缺失、未知、共享、非 HTTPS 或回调不匹配的配置会在渲染和网络流量前失败。

共用 Mobile 入口内置 `@capacitor/browser` 适配器，并在授权尝试准备完成后由继续按钮的用户激活直接调用。入口没有 `window.open`、弹窗或携带令牌的自定义 URL 回退。`IndexedDbInstallationAccountStore` 将所选数据库身份写入数据库名；原生打包负责提供稳定 WebView origin。

## 共享 Session 呈现

打包后的 Mobile 入口把列表／详情导航留在 `apps/mobile`，并从 Client Runtime 的 Desktop 权威 `ConversationSnapshot` 渲染已打开 Session；它不再拥有 Mobile content-block union。详情路由只导入 `ui-conversation`、`ui-tool`、`ui-user-questions` 与 `ui-attachment` 的显式公共 `./presentation` 入口，以及公共 `ui-primitives`。这些入口执行 Desktop Web composition 使用的同一套 Markdown、code、image、普通与未知 Tool、diff、terminal summary、Approval、Ask User、error 与 InputBar implementation。Mobile 只提供导航、图片加载与 prompt/cancel adapter，绝不挂载 Desktop columns、Settings、model selection、plugin configuration 或 terminal input。

产品证据构建并加载该入口。`apps/mobile/prototype-companion` 与开发端口 5173/5174 都不是 Mobile 产品验收 origin。

`apps/mobile/src/companion-cache.ts` 是尚未接入入口的库：它按配对 Desktop 以 Personal Pairing seam 注入的 AES-GCM 密钥密封已打开的 Workspace/Session 元数据与 transcript，并把行存入由 `companionCacheDatabaseName` 命名的 IndexedDB 数据库（`${accountStorageNamespace(environment, accountId)}:companion-cache`），使账号切换把缓存和回执与配对密钥存储隔离开。附件字节、终端内容、spill 文件与凭据永不进入缓存。`CompanionUncertainOperationSettlement` 仅在 mutation 离开设备后写入 Operation Receipt，发送前查阅已有回执，通过 `query-operation-status` 对账未知回执，且永不重放 operation。

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
pnpm --filter @deepseek-ai/dsh-mobile exec vite --host
```

Vite 通过 [`tsconfig.base.json`](../../tsconfig.base.json) 的 paths 解析工作区包，因此这些命令在源码平面上运行。Android 模拟器必须对 Vite 端口做 `adb reverse` 并打开 `http://127.0.0.1`；`10.0.2.2` 不是安全上下文，无法创建 Installation id。

## 已知限制与暂缓事项

- 生产配对在独立 Noise 评审接纳经过评审的握手提供方前保持不可用。只有所选 Platform 环境为开发环境时，`VITE_PERSONAL_PAIRING_KEYLESS=1` 才会选择真实开发控制器与明确标记为未评审的 keyless Mobile 握手。该模式还要求 `VITE_REMOTE_RELAY_WSS_URL`、`VITE_REMOTE_RELAY_ATTACH_TIMEOUT_MS`、`VITE_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS`、`VITE_REMOTE_RELAY_RECONNECT_DELAY_MS`、`VITE_REMOTE_RELAY_INBOUND_MAX_BYTES` 和 `VITE_REMOTE_RELAY_INBOUND_MAX_MESSAGES`；所有字段都在应用渲染前完成校验。
- Companion Cache 库尚未接入 Mobile 入口：composition 不会构造 `companionCacheDatabaseName`、注入 #31 配对派生密钥、应答 Desktop 的 `query-operation-status` 查询，也不提供 composer、离线回执或清除缓存 UI。
- 加密 Companion Session transport 仍须向打包入口提供权威 `ConversationSnapshot`、图片 loader 以及 submit/cancel adapter；presentation seam 不会合成这些值，也不会把 `companion-push` 复用为 Session authority。
- Remote Companion traffic 与附件 flow 不在此 shell 范围内。`CompanionForegroundRuntime` 是 Relay start/stop 的唯一所有者：配对与可见性共用一条转移队列，Mobile 在 Desktop resync 密文到达后通过 `onCiphertext` 调用 `synchronize()`，`unpair()` 会丢掉 grant，因此之后的可见性变化不能再 `start()` socket。`settleCompanionInteraction` 要求前台重连与该同步；原生 APNs/FCM 登记与真机投递仍不在此 shell 范围内。
- 原生 iOS/Android 工程生成与设备打包不属于本 shell；仓库内 composition 已包含 Capacitor 系统浏览器适配器与共用 WebView 账号生命周期。
