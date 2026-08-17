# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Gestalt 的 Desktop Host。Electron 拥有窗口、菜单和 GitHub 自动更新。它启动捆绑的官方 Node 加上 `dsh web --host 127.0.0.1 --port 0 --patch ./cordis.patch.yml`，并打开该环回 URL。叠加层加入 GESTALT 次标、拖拽带和 Update Control；只有更新可操作或发现版本后发生错误时，控件才会出现。浏览器 `dsh web` 不加载这层。

窗口退出、Ctrl+C 和 smoke 测试结束都会取消尚未完成的启动、停止 Web Host，并等待其进程退出后再终止 Electron。首次启动或后续崩溃共允许一次重试，之后窗口才显示 Host 错误。

主窗口只接受当前环回 Host 同源导航。普通 HTTP 链接交给系统浏览器；其他来源和 scheme 不能替换 Session Surface，也不能创建另一个 Electron 窗口。

在 macOS 上，28px 顶部间距让未改动的 DSH 侧栏标题行避开 traffic lights。Windows 使用覆盖整个窗口的 36px 拖拽行，最小化、最大化和关闭按钮各占 46px。未支持平台的开发运行保留系统窗口框架。

Desktop 将 `build/icon.icns`、`build/icon.ico` 和 `build/icon.png` 作为自有资源，其字节与千机·Gestalt 已跟踪的生产图标一致。electron-builder 在 macOS 使用 ICNS，并将 ICO 资源写入未签名的 Windows 可执行文件；发布 workflow 会校验该 PE 文件包含最大的源 ICO 帧。PNG 供未打包的 macOS Dock 图标与 Windows 运行时窗口图标使用。打包后的 PNG 是显式 extra resource，不依赖对构建资源的隐式查找。

Dock / 开始菜单的 cwd 是 Launch Directory（Application Support / `%APPDATA%` 下的 `defaultWorkspace`）。用户数据仍在 `~/.dsh`。

## 开发

```sh
pnpm install
pnpm gestalt:dev
```

需要 `DSH_NODE` 或 `npm_node_execpath` 上的真正 Node（pnpm 会设置后者）。不要让 Electron 用自己的 execPath 去跑 `dsh`。

## 发布

从 `master` 运行 `Desktop Release` workflow，填写包版本并选择 `publish`。macOS arm64 与 x64 会先在匹配架构的 GitHub runner 上安装依赖；发布构建通过 `desktop-release` environment 完成签名和公证，dry run 不接收发布凭据。Windows NSIS 未签名但仍更新。workflow 会校验每个官方 Node 归档、启动每个打包目标、通过 Desktop bridge 往返读取 disabled 更新状态、等待 renderer 应用该状态、要求未激活的 Update Control 保持缺席、检查 Mac app 的签名和已装订公证票据，在已测试提交上创建 `gestalt-v<version>` 标签与 draft Release，上传并核验精确的安装包、blockmap 与更新 feed 集合，然后发布 Release。交接失败或中断时，workflow 会删除本次运行拥有的标签和 draft。已下载更新只在用户选择“安装并重启”后安装。

每个发布版本都必须在 `release-notes/` 下提供双语 manifest，并显式指定基线类型、仓库和提交。创建标签前，workflow 会校验 manifest 版本及其派生标签，确认该基线是受测提交的祖先，从 Git 计算提交数，并把 draft 正文渲染到 notes file。`0.1.0` manifest 使用 `official-upstream` 基线 `deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`；正文链接从该提交到 `gestalt-v0.1.0` 的完整比较。后续 manifest 可以使用 `previous-release` 基线。

本机未签名 arm64 排练（不做公证）：

```sh
node apps/desktop/scripts/fetch-node.mjs --platform darwin --arch arm64
pnpm --ignore-scripts --config.node-linker=hoisted --config.inject-workspace-packages=true \
  --filter @deepseek-ai/dsh deploy --prod apps/desktop/resources/dsh
node apps/desktop/scripts/isolate-dsh-snapshot.mjs
pnpm --filter @deepseek-ai/dsh-desktop package:unsigned
```

hoisted deploy 会纳入工作区包，但不带 pnpm 的链接式虚拟依赖图。`pnpm deploy` 仍会留下少量指向仓库的 `file:` 链接；isolate 一步把这些目标拷进快照，让打包后的 Web Host 能在仓库外解析 `dsh`，并确保 Windows 安装器不会归档目录 junction。

## Known Limitations and Deferred Work

- **安装包里的 Node + dsh 快照由发布 workflow 组装** — `gestalt:dev` 跑的是工作区源码树。
- **没有 Windows Authenticode** — SmartScreen 会警告；更新器仍会运行。
