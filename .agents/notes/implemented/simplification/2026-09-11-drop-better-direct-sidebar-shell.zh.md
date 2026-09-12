# Agent Note: 删除未挂载的 Better 直接 Sidebar 壳

Status: implemented

[English](2026-09-11-drop-better-direct-sidebar-shell.md) | 中文

## 问题

官方 Web 与 Desktop 图已经把 Better 能力注册到 `ui-sidebar-right`。`packages/client/ui-better-sidebar/src/client/index.ts` 只调用 `registerOfficialFiles`、官方 runtime/Changes/Browser/打开路由/设置适配器，以及 locale/IME/Side Chat 准入。它从不把 `Sidebar.tsx` 挂到 `document.body`。未使用的壳仍附带第二套工作台（`data-dsh-panel-host`）、layout-push CSS、split-pane TabBar、自由窗口层，以及钉住这套第二 UI 的测试和 e2e 选择器。

生产 `rg` 找不到对 `./Sidebar`、`../Sidebar` 或 `client/Sidebar` 的 import。`layout-push.ts` 只被 `Sidebar.tsx` 引用。`src/client/sidebar/*` 只被 `Sidebar.tsx` 引用。`split-pane.tsx`、`TabBar.tsx`、`FreeWindow.tsx`、`OrphanedTab.tsx` 和 `tab-content-memo.ts` 同属这套未挂载集群。`src/client/builtins/index.ts` 的 `registerBuiltins` 没有生产调用方。`layout.css` 没有任何 import。`apps/web/tests/browser-dock.e2e.ts` 仍点击 `[data-dsh-better-sidebar]` 的 Close。

## 决策

删除未挂载的 Better 壳，以及只为钉住它而存在的测试。保留 Host `/sidebar` 路由、官方 Sidebar 注册、官方 file/runtime/Changes/Side Chat 正文仍使用的 `state.ts` 类型、这些正文消费的 `FileTree`/`EditorHost`/`SideChatView`/`sidebar.module.css`，以及已发布的 `cordis.patch.yml` 插件安装通道。把文件树子菜单翻转 CSS 从未使用的 `layout.css` 迁到 `sidebar.module.css`。把 Browser dock 过期关闭 e2e 指到官方 DockKit 标签关闭控件（`[data-dockkit-tab-close]`），其英文标签仍是 `Close`。

这交付了[在官方工作台统一 Sidebar 能力](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.zh.md)中「删除 Better 直接根」的一半，但不删除 `ctx.betterSidebar` 类型，也不删除官方正文仍作为类型导入的 snapshot 标签注册表。

## 考虑过的替代方案

**删除整个 `ui-better-sidebar` 包。** 拒绝，因为 Host 的文件/Git/PTY/Side Chat/jobs 路由以及官方标签正文仍在该包中；删包会丢掉产品能力，而不是死 UI。

**为已发布的 `dsh plugin add dsh-better-sidebar` 通道保留该壳。** 对本仓 Web/Desktop 图拒绝：该通道的 client factory 就是同一个 `src/client/index.ts`，已经不再挂载该壳。期望第二套 React 根的第三方安装本来也拿不到。

**把未使用文件当作上游 snapshot 留下。** 拒绝，因为它们与官方所有者决策矛盾，让过时 e2e 选择器继续活着，并为从不挂载的 UI 付出审阅和 HMR 成本。

## 影响

构建出的 client 不再包含未挂载的第二套工作台组件。官方 Browser 关闭仍使用 DockKit 带标签的 Close 控件。关闭 Better-store 最后一个标签的测试（`open-tab-landing.client.spec.ts`）以及测量 Better layout-push/TabBar overlay chrome 的测试随该 store UI 一起删除；官方关闭/收起仍由 `ui-sidebar-right` 持有。`FileTree.tsx` 和 `state.ts` 等 snapshot 源码保留，因为官方正文仍导入它们。
