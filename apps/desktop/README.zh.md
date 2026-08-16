# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Gestalt 的 Desktop Host。Electron 拥有窗口、菜单和 GitHub 自动更新。它启动捆绑的官方 Node 加上 `dsh web --host 127.0.0.1 --port 0 --patch ./cordis.patch.yml`，并打开该环回 URL。叠加层加入 GESTALT 次标、拖拽带和 Update Control。浏览器 `dsh web` 不加载这层。

窗口退出、Ctrl+C 和 smoke 测试结束都会先停止 Web Host，并等待其进程退出后再终止 Electron。

在 macOS 上，侧栏开关位于 28px 拖拽行中，接在 traffic lights 之后；全屏时回到侧栏 12px 内边距。Windows 使用覆盖整个窗口的 36px 拖拽行，最小化、最大化和关闭按钮各占 46px。未支持平台的开发运行保留系统窗口框架。

Dock / 开始菜单的 cwd 是 Launch Directory（Application Support / `%APPDATA%` 下的 `defaultWorkspace`）。用户数据仍在 `~/.dsh`。

## 开发

```sh
pnpm install
pnpm gestalt:dev
```

需要 `DSH_NODE` 或 `npm_node_execpath` 上的真正 Node（pnpm 会设置后者）。不要让 Electron 用自己的 execPath 去跑 `dsh`。

## 发布

打 `gestalt-v0.1.0` 标签并跑 `Desktop Release` workflow。Mac 用仓库 secrets 公证；Windows NSIS 未签名但仍更新。

本机未签名 arm64 排练（不做公证）：

```sh
node apps/desktop/scripts/fetch-node.mjs --platform darwin --arch arm64
pnpm --filter @deepseek-ai/dsh deploy --prod --legacy apps/desktop/resources/dsh
node apps/desktop/scripts/isolate-dsh-snapshot.mjs
pnpm --filter @deepseek-ai/dsh-desktop package:unsigned
```

工作区包的 `pnpm deploy` 会留下指向仓库的 `file:` 链接。isolate 一步把这些目标拷进快照，打包后的 Web Host 才能在仓库外解析 `dsh`。

## Known Limitations and Deferred Work

- **安装包里的 Node + dsh 快照由发布 workflow 组装** — `gestalt:dev` 跑的是工作区源码树。
- **没有 Windows Authenticode** — SmartScreen 会警告；更新器仍会运行。
