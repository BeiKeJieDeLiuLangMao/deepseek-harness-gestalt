# @deepseek-ai/dsh-browser-runtime-electron

[English](README.md) | 中文

这是服务临时与命名持久 Profile 的进程内 Electron Browser Runtime Provider。它用本进程的 `session.fromPartition` 与隐藏的离屏 `webContents` 实现 `ctx.browserRuntime`。截图使用 `webContents.capturePage`；页面文本使用 `executeJavaScript`。命名 Profile 恢复 `persist:…` partition；临时 Profile 使用唯一 partition，且不留下可复用身份。partition 文件留在 Electron `userData` 下，绝不写入 `~/Library/Application Support/Tandem Browser`。

插件仅在 `process.versions.electron` 已设置或测试注入 Electron API 时加载。在 Node 上组合会在加载时失败。Desktop Host 持有隐藏窗口；Dock 仍是截图、标题与文本的原生窗格，不嵌入第二个 BrowserView。

## 配置

| 字段 | 含义 | 默认值 |
|---|---|---|
| `idPrefix` | DSH 持有的不透明 Profile、Workspace 与浏览器身份前缀 | `electron` |
| `viewportWidth` | 用于离屏截图的隐藏窗口宽度 | `1280` |
| `viewportHeight` | 用于离屏截图的隐藏窗口高度 | `800` |
| `requestTimeoutMs` | 每次 Chromium 导航或内容读取的上限 | `30000` |

时长与视口尺寸必须是正安全整数。所有操作进入同一个串行队列。写操作要求调用方提供最后观察到的 `expectedRevision`。人工 `input` 与 `takeover` 会把报告的 `controlOwner` 设为 `human`；`returnControl` 与 Agent 写入会把它设为 `agent`。同一命名 Profile 的第二个打开写入方会以 `BROWSER_PROFILE_BUSY` 拒绝。释放开始后的操作会以 `BROWSER_DISPOSED` 拒绝。释放阶段排空队列并销毁剩余隐藏窗口。

渲染进程崩溃会提交 reason 为 `crashed` 的 `BrowserUnavailableState`，并为同一 target 重建隐藏窗口。恢复耗尽则提交 `reason: 'reconnect-failed'`。格式错误的 Chromium 结果会以 `BROWSER_PROTOCOL` 拒绝。

`listenElectronBrowserHttp` 绑定一个 loopback HTTP 服务器，复制 Tandem 的 session、tab、navigate、page-content、screenshot、focus 与 destroy 操作，使 Web Host 可以驱动该引擎，而不嵌入第二个 Electron 应用。

## 模型体验

通过 dsh-tool-browser 间接影响模型；该 Consumer 会渲染全部页面、截图、生命周期与可用性事实。

#### KV 缓存影响

Provider 自身不贡献请求文本；Consumer schema 与已记录结果决定缓存变化。

## 已知限制与后续工作

- 隐藏的离屏 `webContents` 不会显示在 Dock 中；Dock 仍渲染截图、标题与文本事实。
- 真实 Chromium e2e 仅在 `process.versions.electron` 已设置时运行；Node 单元测试注入 Electron API，且从不 spawn Tandem.app。
