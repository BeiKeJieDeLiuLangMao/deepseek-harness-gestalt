# @deepseek-ai/dsh-client-ui-browser

[English](README.md) | 中文

Session 持有的 Browser Dock 与收起后的标签页预览。当本 Session 拥有标签页且 `dockOpen` 为 true 时，插件以顺序 10 的 `id: 'browser'` 占用 `details`；否则占用 `conversation.browser.preview`。实时 Workspace 事实通过 `useProjection('browserWorkspace')` 到达。变更走生成的 `remote.browserWorkspace` 命名空间。

展开的 Dock 没有 Profile 切换或 Agent 状态行。标签页占据顶行，收起控件留在右缘。工具栏显示刷新、地址栏旁的持久 Profile 标签，以及对当前标签页的接管或交还智能体。视口显示最近一次截图与页面文本。第一个 Agent 标签页会打开 Dock；人工收起后，后续 Agent 活动不会再次打开它。

收起预览是同一 Dock 的单行分层摘要，不是第二个 Dock。它没有外壳或页脚。点击后层会选中该标签页；点击当前层会打开 Dock。Dock 可见时预览隐藏。普通 MCP 工具行仍留在对话历史中。

占用方专用详情宽度范围为 420/640/960 px。切换 Session 会从 Workspace 投影恢复该 Session 的可见性、宽度、实例、标签页与当前控制权所有者。

行为由 [Browser Dock Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-browser-dock.md) 规定。

## 模型体验

无，因为这个面向人的 Dock chrome 不增加工具、消息、提示词或 provider 请求；页面操作仍由 `dsh-tool-browser` 负责。

#### KV Cache 影响

无；本包从不组装或发送 provider 请求。

## 已知限制与延后工作

- **截图视口，不是 live WebContentsView**——Dock 渲染 Session 持有 Runtime 的 observe 与 screenshot 事实；它不嵌入第二个 Electron 进程。
- **无密钥 Host Runtime 是确定性的**——已交付的 Host 组合使用 `dsh-browser-runtime-deterministic`，使 Dock 与 GIF 无需 Tandem 即可运行。后续工单可以替换该 Provider。
