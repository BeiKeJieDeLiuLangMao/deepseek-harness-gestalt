# `@deepseek-ai/dsh-client-ui-desktop`

[English](README.md) | 中文

仅 Desktop 的 Session Surface 铬。Desktop Host 的 `--patch` 叠加层插入这一行；浏览器 `dsh web` 不加载。它在 `sidebar.brand` 上选中 GESTALT 字标，填充 `sidebar.chrome.drag`，并在 `sidebar.footer.action` 注册 Update Control。更新和窗口操作都走 Desktop Host preload 注入的 `window.dshDesktop`。

macOS chrome 在未改动的 DSH 侧栏标题行上方为原生 traffic lights 保留空间。Windows 拖拽行横跨视口，三个 caption 按钮位于不可拖拽区域。其他开发平台不绘制自定义 Window Chrome，并保留系统窗口框架。

## Model Experience

无。本包只画 Desktop 铬，不进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **没有 `window.dshDesktop` 时插件空转** — Update Control 与 Window Chrome 不渲染，更新源保持空闲。
