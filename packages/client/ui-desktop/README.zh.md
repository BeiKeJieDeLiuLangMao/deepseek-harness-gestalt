# `@deepseek-ai/dsh-client-ui-desktop`

[English](README.md) | 中文

仅 Desktop 的 Session Surface 铬。Desktop Host 的 `--patch` 叠加层插入这一行；浏览器 `dsh web` 不加载。它在 `sidebar.brand` 上选中 GESTALT 字标，填充 `sidebar.chrome.drag`，并在 `sidebar.footer.action` 注册 Update Control。更新和窗口操作都走 Desktop Host preload 注入的 `window.dshDesktop`。

macOS 拖拽行先避开原生 traffic lights，再放置侧栏开关。Windows 拖拽行横跨视口，三个 caption 按钮位于不可拖拽区域。全屏会隐藏 macOS traffic lights，并让侧栏开关回到侧栏内边距。

## Model Experience

无。本包只画 Desktop 铬，不进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **没有 `window.dshDesktop` 时插件空转** — Update Control 不渲染，更新源保持空闲；若该行已挂载，拖拽带仍占 36px。
