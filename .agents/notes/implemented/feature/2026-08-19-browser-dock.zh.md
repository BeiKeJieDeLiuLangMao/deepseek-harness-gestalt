# Agent Note: 原生 Browser Dock

Status: implemented

[English](2026-08-19-browser-dock.md) | 中文

## 问题

Session 可以拥有 Browser Workspace、实例、标签页、Dock 几何与当前控制权所有者，但 Session Surface 仍没有展示这些事实的原生窗格。再嵌入一个 Electron BrowserView 会把所有权拆给 Desktop Host。在对话历史里再放一个 Dock 会重复同一个占用方。

## 决策

`dsh-client-ui-browser` 把 Session 持有的 Browser Workspace 呈现为一个原生详情占用方，以及该占用方的收起预览。当本 Session 拥有标签页且 `dockOpen` 为 true 时，展开的 Dock 以 `id: 'browser'` 占用 `details`。否则收起预览占用 `conversation.browser.preview`。实时事实通过 `useProjection('browserWorkspace')` 到达。变更走生成的 `remote.browserWorkspace` 命名空间。

Dock 没有 Profile 切换或 Agent 状态行。标签页占据顶行，收起控件留在右缘。持久 Profile 名称只出现在地址栏旁。刷新会重新打开最近一次观察到的 URL。接管与交还智能体会写入 Workspace 快照已经持久化的同一个 `controlOwner`。视口显示最近一次截图与页面文本；它不嵌入第二个进程。

第一个 Agent 标签页会打开 Dock。人工收起后，后续 Agent 活动不会再次打开它。收起预览是同一 Dock 的单行分层摘要。点击后层会选中该标签页；点击当前层会打开 Dock。Dock 可见时预览隐藏。普通 MCP 工具行仍留在对话历史中。

占用方专用详情宽度范围为 420/640/960 px，来自 [#60](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/60)。切换 Session 会从 [#67](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/67) 持有的 Workspace 投影恢复该 Session 的可见性、宽度、实例、标签页与当前控制权所有者。

Host 组合挂载 `dsh-browser-runtime-deterministic` 与 `dsh-browser-workspace`，使 Dock 拥有 Session 持有的 Runtime，而不需要第二个 Electron 进程。standard、code 与 cordis preset 挂载 `dsh-tool-browser`。Web 组合挂载 Dock 插件。

## 考虑过的替代方案

**嵌入 Desktop 持有的 Electron BrowserView。** 否决，因为 DeepSeek Gestalt 必须拥有 Dock 占用方；第二个进程会把页面身份从 Session Workspace 拆开。

**Dock 打开时仍在对话里保留第二张 live 卡片。** 否决，因为预览是同一 Dock 的重新打开路径，不是第二个 Dock。

**只把 Dock 打开状态与宽度存在 layout store。** 否决，因为每个 Session 必须在切换与重新加载后恢复这些事实。

## 后果

人与 Agent 在同一组 Session 持有的标签页身份上共享一个 Dock。收起是 Session 事实，因此后续 Agent 活动不能抢开该窗格。Web 与 Desktop 渲染同一个占用方；两者都不嵌入第二个 BrowserView。发布仍属于后续工单。

## 验证

- `pnpm exec vitest run packages/client/ui-browser packages/browser/browser-workspace packages/client/ui-layout packages/client/ui-conversation/tests/gate-branch-tails.client.spec.tsx packages/client/ui-conversation/tests/chat-apply.client.spec.tsx`
- `pnpm exec vitest run packages/client/ui-browser --coverage --coverage.include='packages/client/ui-browser/src/**/*.ts'`
- `pnpm run check:ci:static`
