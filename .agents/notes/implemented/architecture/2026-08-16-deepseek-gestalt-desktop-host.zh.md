# Agent Note: DeepSeek Gestalt Desktop Host

Status: implemented

[English](2026-08-16-deepseek-gestalt-desktop-host.md) | 中文

## Problem

只有 `dsh web` 会注入 `window.__DSH_BOOT__` 并提供 Session Surface。用户若要可安装窗口、GitHub 版本发现和自动更新，既不能靠 CLI，也不能打开 Vite 入口。在 Electron 里重做 Host 会分叉引擎，并破坏现有的工作区、选目录和会话模型。

## Decision

DeepSeek Gestalt 是 Desktop Host：Electron 拥有窗口、应用菜单、进程寿命和更新检查。启动时拉起捆绑的官方 Node 加上锁死的 `dsh web` Web Host（`--host 127.0.0.1 --port 0`），并打开该环回 URL。Web Host 保留全部 Host 能力，包括原生选目录。

Electron 在退出阶段继续监管 Web Host。窗口退出、终止信号和 smoke 结束都会停止子进程，并等待进程退出后才终止 Desktop Host；主动关闭不会触发一次性崩溃重启。

第一个 Desktop Bundle 是 `0.1.0`，与 npm `dsh` 版本线独立。app id 为 `com.gestalt.deepseek`。显示名为 DeepSeek Gestalt。更新源是 `BeiKeJieDeLiuLangMao/deepseek-harness-gestalt` 上的 GitHub Releases（`gestalt-v*` 标签，非 prerelease）。Mac 用千机团队身份公证；Windows 发未签名 NSIS 仍更新。

Desktop 只多一层 `--patch`：GESTALT 次标、拖拽带、设置右侧的 Update Control。浏览器 `dsh web` 不加载这层。从 Dock 启动时，Web Host 的 cwd 是 `~/Library/Application Support/DeepSeek Gestalt/defaultWorkspace`（Windows：`%APPDATA%\DeepSeek Gestalt\defaultWorkspace`），进程 cwd 不是安装目录。Session Surface、`~/.dsh` 和 web profile 仍然共用。

macOS 拖拽行在 traffic lights 后留下固定间距，全屏时侧栏开关回到正常内边距。Windows 使用横跨整个窗口的拖拽行，其中三个 caption 按钮为不可拖拽区域。未支持平台的开发运行保留系统窗口框架。

## Alternatives considered

**用 Electron 当 Web Host（`ELECTRON_RUN_AS_NODE`）。** 所有原生插件都要按 Electron ABI 重编，引擎行为和 CLI `dsh web` 会分叉。

**像千机·Gestalt 那样一工作区一窗口。** 现有 Session Surface 已经在一个侧栏里列出全部 Workspace。

**第一代 feed 用官方 `deepseek-ai/deepseek-harness` Releases。** 当前 origin 是个人 fork；以后改 feed 会让已装包断更。

**Windows 先 Authenticode 再发更新。** electron-updater 可以更新未签名 NSIS；代价是 SmartScreen。Mac 仍然必须公证。

**用 Electron 对话框替换原生选目录。** 那会改 Web Host 能力。Desktop 只补 Apple Events entitlement，让现有 osascript 选择器在 Hardened Runtime 下能跑。

## Verification

- `pnpm gestalt:dev` 启动 Desktop Host，由它启动 Web Host，并在环回 URL 上加载带 `window.__DSH_BOOT__` 的页面（不是裸 Vite）。
- 浏览器 `dsh web` 仍是 HARNESS 次标，没有拖拽带，也没有 Update Control。
- Desktop 组合显示 GESTALT 次标、logo 行上方的拖拽带，以及与设置同一行的 Update Control。
- macOS 展开、收起和全屏布局都让侧栏开关避开原生控件；Windows 把 caption 按钮放在全窗口拖拽行右侧。
- Dock 式启动把 Launch Directory 当作 cwd，并且不把该路径登记为 Workspace。
- Desktop 退出会等待 Web Host 进程退出；smoke 测试会拒绝遗留的孤儿子进程。
- 单测覆盖从 `dsh web:` 行发现 URL、Launch Directory 解析，以及不下载的更新阶段转换。

## Consequences

- 一次 Desktop 发布是 `dsh` 加 Electron 的快照。npm `dsh` 版本线继续独立。
- 公证后的 Mac 身份属于千机 Apple 团队。以后改 app id 等于新应用。
- 在有 Authenticode 证书之前，Windows 用户会看到 SmartScreen。
- 个人 GitHub feed 就是产品 feed；没有能保住已装包更新的迁仓路径。
