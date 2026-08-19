# Agent Note: Desktop updates stage before Install and restart

Status: implemented

English | [中文](2026-08-19-desktop-update-stage-before-install.zh.md)

## Problem

electron-updater's `update-downloaded` means the HTTP zip is on disk. On macOS, Squirrel still has to copy that bundle into a temp directory, clear quarantine, and verify the signature. The Update Control treated the HTTP event as ready to install, so Install and restart started a ~68s blackout (0.1.2 → 0.1.3 ShipIt log).

## Decision

Keep electron-updater and Squirrel. After the zip lands, macOS enters `preparing` and waits for Electron `autoUpdater`'s native `update-downloaded` (`squirrelDownloadedUpdate`). Only then offer Install and restart, which should `rename()` the staged `.app` and relaunch. Windows still goes HTTP zip → `downloaded`. Ordinary quit does not install. `autoInstallOnAppQuit` stays true on macOS only so Squirrel prefetches during `preparing`.

Do not switch to Sparkle 2. ChatGPT/Codex on macOS uses Sparkle for the same stage-then-relaunch product, but it is Chromium, not Electron, and Windows here is NSIS.

Do not enable `SquirrelMacEnableDirectContentsWrite`. Same-volume `rename` of the `.app` is atomic; the dangerous half-write is the cross-volume `EXDEV` delete-then-copy, which that flag does not remove.

If native staging never signals, fail `preparing` to `error` after the stage timeout instead of offering install.

## Alternatives considered

**Runtime-prune official Node / the dsh snapshot.** Shrinks download and the prepare copy, but the bundle will grow again with features. It is not the restart contract.

**Call the HTTP event ready and hope prefetch finishes first.** Today's `autoInstallOnAppQuit` already prefetches; the UI did not wait, so the user could still click into the copy.

## Consequences

Update Control shows an indeterminate preparing label. Tests drive HTTP zip ready and native staged as two events on the updater port. Desktop Release, notarization, and `gestalt-v*` rules are unchanged.

## Testing

`apps/desktop/tests/updater.spec.ts` pins preparing until the native stage event, and a timeout to `error`. `packages/client/ui-desktop/tests/update-control.client.spec.tsx` pins preparing as visible, disabled, and not an install click.
