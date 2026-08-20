# Agent Note: Desktop 启动跳过 Keychain 加密探测

Status: implemented

[English](2026-08-20-desktop-boot-skips-safe-storage-probe.md) | 中文

## Problem

带签名的 macOS Desktop Release packed smoke 在配置了 Platform 环境时会卡在 `window created` 之后。`safeStorage.isEncryptionAvailable()` 是同步的原生 Keychain 探测；在 GitHub Actions runner 上会卡住 Electron 主进程，Host 起不来，smoke 写不出 `ok`，GitHub Release 任务被跳过。

## Decision

Desktop Host 启动时不探测加密是否可用。它始终用 `safeStorage.encryptString` / `decryptString` 组成 `EncryptedDesktopAccountStore`。首次 `start()` 仍只在内存里分配 installation id，不碰 Keychain。加密与解密仍是首次持久化或恢复时的能力失败点。

## Alternatives considered

**在主线程给探测加超时。** 同步原生卡住无法从同一线程用 Promise 赛跑。

**把探测挪到 Web Host 启动之后。** smoke 在写 `ok` 之前仍需要 Account 和 Pairing；卡住只会换位置，不会消失。

**只补 Keychain entitlement。** 这可能有助于生产环境落盘，但 CI 仍然没有 Keychain UI；启动时探测仍会挡住发布。

## Consequences

带 Platform 环境的已签名 Mac 启动会在不访问 Keychain 的情况下进入 Web Host 启动。加密不可用会在保存或加载记录时暴露，而不是冻住窗口。Packed smoke 可以在 `ok` 之后排空 fail-closed Relay。

## Testing

`apps/desktop/tests/platform-account.spec.ts` 继续保证首次 `start()` 不落盘。Desktop Release packed smoke 覆盖带 Platform 环境的 Relay 排空路径。
