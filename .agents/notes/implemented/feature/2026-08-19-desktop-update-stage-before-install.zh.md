# Agent Note: Desktop 更新在「安装并重启」之前完成 stage

Status: implemented

[English](2026-08-19-desktop-update-stage-before-install.md) | 中文

## Problem

electron-updater 的 `update-downloaded` 只表示 HTTP zip 已在磁盘上。macOS 上 Squirrel 还要把该包拷到临时目录、清除 quarantine 并验签。Update Control 把 HTTP 事件当成可以安装，因此「安装并重启」会进入约 68 秒的黑屏（0.1.2 → 0.1.3 的 ShipIt 日志）。

## Decision

继续使用 electron-updater 和 Squirrel。zip 落地后，macOS 进入 `preparing`，等待 Electron `autoUpdater` 的原生 `update-downloaded`（`squirrelDownloadedUpdate`）。然后才提供「安装并重启」，此时应 `rename()` 已 stage 的 `.app` 并重新启动。Windows 仍是 HTTP zip → `downloaded`。普通退出不安装。`autoInstallOnAppQuit` 仅在 macOS 为 true，以便 Squirrel 在 `preparing` 期间预取。

不要改用 Sparkle 2。本机 ChatGPT/Codex 用 Sparkle 实现同样的 stage-then-relaunch 产品形态，但它是 Chromium 而非 Electron，这里的 Windows 仍是 NSIS。

不要打开 `SquirrelMacEnableDirectContentsWrite`。同盘对 `.app` 的 `rename` 是原子的；真正会半残的是跨卷 `EXDEV` 先删再拷，该开关消除不了这条路径。

若原生 staging 一直不发出信号，`preparing` 在超时后进入 `error`，而不是提供安装。

## Alternatives considered

**运行时裁剪官方 Node / dsh snapshot。** 能缩短下载和 prepare 拷贝，但功能增加后包还会变大。它不是重启契约。

**把 HTTP 事件当成就绪，指望预取先完成。** 今天的 `autoInstallOnAppQuit` 已经预取；UI 没有等待，用户仍可能点进那次拷贝。

## Consequences

Update Control 显示不确定进度的「正在准备更新」。测试把 HTTP zip 就绪和原生 staged 当成更新器端口上的两个事件。Desktop Release、公证和 `gestalt-v*` 规则不变。

## Testing

`apps/desktop/tests/updater.spec.ts` 固定在原生 stage 事件之前保持 preparing，以及超时进入 `error`。`packages/client/ui-desktop/tests/update-control.client.spec.tsx` 固定 preparing 可见、禁用，且不是安装点击。
