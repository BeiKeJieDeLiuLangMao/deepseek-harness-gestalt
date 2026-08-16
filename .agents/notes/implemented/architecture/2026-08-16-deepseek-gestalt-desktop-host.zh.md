# Agent Note: DeepSeek Gestalt Desktop Host

Status: implemented

[English](2026-08-16-deepseek-gestalt-desktop-host.md) | 中文

## Problem

只有 `dsh web` 会注入 `window.__DSH_BOOT__` 并提供 Session Surface。用户若要可安装窗口、GitHub 版本发现和自动更新，既不能靠 CLI，也不能打开 Vite 入口。在 Electron 里重做 Host 会分叉引擎，并破坏现有的工作区、选目录和会话模型。

## Decision

DeepSeek Gestalt 是 Desktop Host：Electron 拥有窗口、应用菜单、进程寿命和更新检查。启动时拉起捆绑的官方 Node 加上锁死的 `dsh web` Web Host（`--host 127.0.0.1 --port 0`），并打开该环回 URL。Web Host 保留全部 Host 能力，包括原生选目录。

Electron 在退出阶段继续监管 Web Host。窗口退出、终止信号和 smoke 结束都会取消尚未完成的启动、停止子进程，并等待进程退出后才终止 Desktop Host；主动关闭不会触发一次性崩溃重启。可信主窗口停留在当前环回 origin，普通网页链接交给系统浏览器，并拒绝其他导航和所有新 Electron 窗口。

第一个 Desktop Bundle 是 `0.1.0`，与 npm `dsh` 版本线独立。app id 为 `com.gestalt.deepseek`。显示名为 DeepSeek Gestalt。更新源是 `BeiKeJieDeLiuLangMao/deepseek-harness-gestalt` 上的 GitHub Releases（`gestalt-v*` 标签，非 prerelease）。每个 macOS 目标都先在匹配架构的 runner 上安装与部署，再使用千机团队身份公证；Windows 发未签名 NSIS 仍更新。普通退出不会安装已下载更新。

Desktop Release 从 `master` 手动运行，并显式指定 Desktop Bundle 版本。发布运行会先用 `apps/desktop/package.json` 校验该版本并拒绝已有标签；macOS 发布打包只在 `desktop-release` environment 中进行，该 environment 的分支策略只允许 `master`，并提供证书与 Apple 公证 secrets。无凭据运行使用另一个 environment，显式关闭 macOS identity 选择和公证。CLI 组装显式提供 Web 和 headless provider 使用的服务定义，让 production-only 部署保留与源码启动相同的插件导入闭包。每个平台都部署注入工作区包的 hoisted 生产快照，再实体化剩余的文件链接；因此 Windows 安装器不会收到供 7zip 遍历的 pnpm 目录 junction 图。每个发布构建都强制签名，并在上传 artifact 前验证 app 签名和已装订的公证票据。两个 macOS 架构和 Windows 都通过已打包 smoke 后，发布 job 校验精确的版本化安装包、blockmap 和更新 feed 集合，在受测提交上创建本次运行拥有的 `gestalt-v<version>` 标签与 draft GitHub Release，上传资产并核对远端文件名，然后发布非 prerelease Release。交接失败或中断时会删除本次运行拥有的 draft 和标签，使同一候选版本可以重试。

Desktop 只多一层 `--patch`：GESTALT 次标、拖拽带、设置右侧的 Update Control。浏览器 `dsh web` 不加载这层。从 Dock 启动时，Web Host 的 cwd 是 `~/Library/Application Support/DeepSeek Gestalt/defaultWorkspace`（Windows：`%APPDATA%\DeepSeek Gestalt\defaultWorkspace`），进程 cwd 不是安装目录。Session Surface、`~/.dsh` 和 web profile 仍然共用。

macOS chrome 为 traffic lights 保留固定顶部间距，同时保留 DSH 侧栏标题和收起交互。Windows 使用横跨整个窗口的拖拽行，其中三个 caption 按钮为不可拖拽区域。未支持平台的开发运行保留系统窗口框架。

## Alternatives considered

**用 Electron 当 Web Host（`ELECTRON_RUN_AS_NODE`）。** 所有原生插件都要按 Electron ABI 重编，引擎行为和 CLI `dsh web` 会分叉。

**像千机·Gestalt 那样一工作区一窗口。** 现有 Session Surface 已经在一个侧栏里列出全部 Workspace。

**第一代 feed 用官方 `deepseek-ai/deepseek-harness` Releases。** 当前 origin 是个人 fork；以后改 feed 会让已装包断更。

**Windows 先 Authenticode 再发更新。** electron-updater 可以更新未签名 NSIS；代价是 SmartScreen。Mac 仍然必须公证。

**用 Electron 对话框替换原生选目录。** 那会改 Web Host 能力。Desktop 只补 Apple Events entitlement，让现有 osascript 选择器在 Hardened Runtime 下能跑。

**在运行 workflow 前先创建发布标签。** 该标签会指向未经检查的候选版本，并在打包或 smoke 失败后残留。发布 job 只在所有目标通过后才与 Release 一起创建标签。

## Verification

- `pnpm gestalt:dev` 启动 Desktop Host，由它启动 Web Host，并在环回 URL 上加载带 `window.__DSH_BOOT__` 的页面（不是裸 Vite）。
- 浏览器 `dsh web` 仍是 HARNESS 次标，没有拖拽带，也没有 Update Control。
- Desktop 组合显示 GESTALT 次标、logo 行上方的拖拽带，以及与设置同一行的 Update Control。
- macOS 展开和收起布局让未改动的侧栏控件位于原生控件下方；Windows 把 caption 按钮放在全窗口拖拽行右侧。
- Dock 式启动把 Launch Directory 当作 cwd，并且不把该路径登记为 Workspace。
- Desktop 退出会等待尚未启动完成和正在运行的 Web Host 进程退出；smoke 测试会拒绝遗留子进程和缺失的 Desktop 组合。
- 无密钥浏览器 golden 会启动已交付 Web profile 与 Desktop overlay；release job 会校验 Node 归档摘要，在 macOS 签名前将打开文件数限制提升到 runner 硬限制，要求发布构建通过代码签名和已装订公证票据校验，并在上传前 smoke 每个打包目标。
- 发布计划测试覆盖版本、分支和已有标签校验；发布资产测试要求两个更新 feed、全部版本化 macOS 与 Windows 安装包及其 blockmap，并排除未打包应用内部文件。
- 单测覆盖从 `dsh web:` 行发现 URL、Launch Directory 解析，以及不下载的更新阶段转换。

## Consequences

- 一次 Desktop 发布是 `dsh` 加 Electron 的快照。私有 Desktop app 不属于 npm `dsh` 发布家族，因此两条版本线保持独立。
- 公证后的 Mac 身份属于千机 Apple 团队。以后改 app id 等于新应用。
- 在有 Authenticode 证书之前，Windows 用户会看到 SmartScreen。
- 个人 GitHub feed 就是产品 feed；没有能保住已装包更新的迁仓路径。
- 发布运行必须先在 `desktop-release` environment 中配置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`，才能开始打包。
