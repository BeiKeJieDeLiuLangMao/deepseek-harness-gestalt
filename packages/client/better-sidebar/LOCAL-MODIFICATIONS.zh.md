# 本地修改

相对 [UPSTREAM.md](UPSTREAM.md) 所钉提交的每一处分歧。产品行为属于 `@deepseek-ai/dsh-client-ui-workbench`，不属于这里。

1. **工作区包清单** — `package.json` / `tsconfig.json` / `tsconfig.dts.json` / 本文件 / `UPSTREAM.md` 由本仓持有。上游 `package.json` 名 `dsh-better-sidebar` 收成 `@deepseek-ai/dsh-client-better-sidebar`；版本跟随 monorepo 根。`tsconfig.json` 的 project references 使用本仓路径（`../../core/session`，不是 `../../session/session`）。快照不是 `tsconfig.client.json` 工程：那些 references 会把宿主 `Context` 合并拉进客户端程序。
2. **`src/config.ts`** — `import z from 'schemastery'` 改为 `import z from '@deepseek-ai/schemastery'`。
3. **`src/context-types.ts`** — 快照从 `@deepseek-ai/cordis` 导入 `Context`，并通过本地 `CordisContext & SidebarContextServices` 交叉类型携带结构化服务接口。仓库 Cordis augmentation 只增加 `betterSidebar`，因此快照镜像不会与能力所有包的声明冲突。
4. **`src/invariant.ts`** — 按本仓 invariant 门禁重写 companion（`PACKAGE_NAME` 与本工作区包名一致）。
5. **`tsdown.config.ts` / `src/client/chunk-loader.ts`** — 客户端 factory id 使用工作区包名；Host/Client 构建面拆开 Node 库与浏览器分块；省略插件注册表用的 `client-registry.js` 通道；分块与客户端 externals 请求 `@deepseek-ai/cordis`。Node 库构建通过 `tsconfig.dts.json`（`noCheck` 与 `noResolve`）只把快照源码声明写入 `lib/types`，这样无需加入客户端聚合，也不会把依赖声明写到依赖源码旁边。
6. **`src/bundle-route.ts`** — `LIB_DIR` 固定为包内 `lib/`，而不是 `dirname(import.meta.url)`。源码启动（`tsx`）否则会去读 `src/client-terminal.js`，终端 / 编辑器 / mermaid 分块会 404。
7. **`src/client/BrowserView.tsx`** — 当 `ctx.get('workbenchBrowser')` 已发布时，标签页渲染官方 chrome。沙箱 iframe 仍是独立安装快照时的回退。
8. **`src/client/service.ts`** — `setPanelOpen(open)` 展开或收起右侧工作台。官方预览与首个 Agent 标签页使用它；仅类型的 `openTab` 不会展开。
9. **`src/client/TabBar.tsx` / `src/client/sidebar.module.css`** — 存在 `window.dshDesktop.chromeOverlayShow` 时，`+` 菜单在 Desktop 原生 overlay 视图里打开，而不是页内 `Menu`。顶部工作台还保留一条 5px 窗口拖拽轨，同时交互式标签栏仍为 `no-drag`；底部工作台没有窗口边缘拖拽轨。`dsh web` 仍用页内菜单，Electron 专用 CSS 属性在那里不生效。
10. **`src/client/index.tsx`** — Desktop overlay 文档（`data-dsh-desktop-overlay` / `?dsh-desktop-overlay=1`）不把快照 `Sidebar` 挂到 `document.body`。overlay 设置仍走 Host chrome 的设置席位。
