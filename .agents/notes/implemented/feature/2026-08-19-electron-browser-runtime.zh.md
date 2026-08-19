# Agent Note: In-process Electron Browser Runtime

状态：已实现

[English](2026-08-19-electron-browser-runtime.md) | 中文

## 问题

Session 持有的 AI Browser 需要在 Desktop 上使用真实 Chromium 引擎。把 Tandem Browser 作为第二个 Electron 应用 spawn 会拆分进程与存储所有权，写入 DeepSeek Gestalt `userData` 之外，并且不能把另一个进程的 `WebContentsView` 嵌入原生 Dock。

## 决策

`dsh-browser-runtime-electron` 在本 Desktop Host 进程中实现 `BrowserRuntime`。命名 Profile 使用 `session.fromPartition('persist:session-…')`；临时 Profile 使用没有 `persist:` 前缀的临时 `session-…` partition，Chromium 只在内存中保存其身份并在关闭时丢弃 —— `dsh-browser-runtime` 中的 `browserTemporaryPartition` 与 `browserSessionNameFromPartition` helper 为所有 Provider 持有该方案。隐藏的离屏 `BrowserWindow` 持有 `webContents`，用于 create、navigate、observe、screenshot、focus、input、takeover、returnControl 与 close。截图使用 `webContents.capturePage`；页面文本使用 `executeJavaScript`；接管文本以逐字符 `sendInputEvent('char')` Chromium 输入送达页面，并附带一段面向聚焦的 input、textarea 或 contentEditable 元素的插入文本脚本。插件仅在 `process.versions.electron` 已设置，或 Node 测试通过包私有的 `installElectronTestHost()` seam 安装 host 时加载（config 不含 Electron 字段）；在普通 Node 上组合会在加载时失败。partition 文件留在 Electron `userData/browser-runtime` 下，绝不写入 `~/Library/Application Support/Tandem Browser`。

Tandem 仍是 HTTP 与 MCP 操作词汇，不是 sidecar 二进制。`listenElectronBrowserHttp` 把 sessions、tabs、navigate、page-content、screenshot、focus 与 destroy 复制到 loopback origin。Desktop Host 启动该引擎，向 Node Web Host 导出 `DSH_ELECTRON_BROWSER_ORIGIN` 与 `DSH_ELECTRON_BROWSER_TOKEN_FILE`，Desktop 叠加层把 `dsh-browser-runtime-tandem` 挂载为协议专用 HTTP 客户端。`command` 与 `cwd` 仍可选，供仓库内 HTTP fixture 使用；生产环境从不启动 Tandem.app。当 `DSH_ELECTRON_BROWSER_ORIGIN` 或 `DSH_TANDEM_BIN` 表明 Desktop 持有进程内 Electron 时，已配置的 fixture `command` 以 `BROWSER_RUNTIME_UNAVAILABLE` 拒绝而不是 spawn sidecar，且客户端无论是否拥有子进程都会通过 HTTP 销毁剩余打开的 session。

Dock 仍是截图、标题与文本的原生窗格。它不嵌入第二个 BrowserView。headless 与浏览器 `dsh web` 继续使用 `dsh-browser-runtime-deterministic`。[Tandem provider Agent Note](2026-08-18-tandem-browser-runtime-provider.md) 中较早的托管子进程设计现在只作为协议客户端保留。

## 考虑过的替代方案

**把 Tandem.app 作为子 Electron 进程 spawn。** 拒绝，因为产品所有权留在本 Desktop Host；第二个 Electron 应用会拆分 partition、userData 与 Dock 事实。

**在 Dock 中嵌入 live BrowserView。** 拒绝，因为 Dock 是 Session 持有的截图、标题与文本窗格；第二个视图会把页面身份从 Workspace 投影中拆开。

**在 Node Web Host 内加载 Electron Provider。** 拒绝，因为 `dsh web` 是没有 `process.versions.electron` 的 Node 子进程；Host 持有 Chromium，并向该子进程发布 Tandem 形态 HTTP。

**删除 tandem 包。** 拒绝，因为 HTTP fixture 测试与 Web Host 仍需要协议客户端；去掉 spawn 路径可以保留 Tandem 作为词汇，而不再使用 sidecar 二进制。

## 结果

Desktop 拥有真实页面，而不再使用第二个 Electron 应用。Web 与 headless 保持无密钥且确定性。Dock 继续渲染 Runtime 事实，而不是 live 视图。真实 Chromium e2e 仅在本进程是 Electron 时运行；Node 覆盖使用注入的 Electron host 与 HTTP fixture。

## 验证

- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-electron packages/browser/browser-runtime-tandem packages/browser/browser-runtime-deterministic --coverage`，并对每个包附 `--coverage.include='packages/browser/<pkg>/src/**/*.ts'`（逐文件 100%）
- `pnpm exec vitest run apps/desktop/tests/browser-runtime.spec.ts apps/desktop/tests/overlay-isolation.spec.ts packages/browser/tool-browser`
- `pnpm run test:snapshot`（browser-runtime 与 browser-runtime-tandem 的 headless transcript）
- `pnpm run typecheck`、`pnpm run build`、`pnpm run publint`、`pnpm run constraints`、`pnpm run doc-sync`
- `packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` 中的 Electron 门控 e2e 在 Node 上以具名原因自跳过：本进程不是 Electron，且不得 spawn Tandem.app。
