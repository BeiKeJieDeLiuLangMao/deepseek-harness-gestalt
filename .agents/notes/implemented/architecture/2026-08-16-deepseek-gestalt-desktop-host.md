# Agent Note: DeepSeek Gestalt Desktop Host

Status: implemented

English | [中文](2026-08-16-deepseek-gestalt-desktop-host.zh.md)

## Problem

`dsh web` is the only process that injects `window.__DSH_BOOT__` and serves the Session Surface. Users who want an installable window, GitHub version discovery, and auto-update cannot get that from the CLI or from opening the Vite entry. Reimplementing the Host inside Electron would fork the engine and break the existing workspace, picker, and session model.

## Decision

DeepSeek Gestalt is a Desktop Host: Electron owns the window, application menu, process lifetime, and update checks. On launch it starts a bundled official Node plus a locked `dsh web` Web Host (`--host 127.0.0.1 --port 0`) and loads that loopback URL. The Web Host keeps every Host capability, including the native directory picker.

Electron supervises the Web Host through shutdown. Window exit, termination signals, and smoke completion cancel a pending start, stop the child, and wait for process exit before the Desktop Host terminates; an intentional shutdown cannot trigger the one-time crash respawn. The trusted main window stays on the active loopback origin, sends ordinary web links to the system browser, and denies other navigation and every new Electron window.

The first Desktop Bundle is `0.1.0`, independent of the npm `dsh` line. The app id is `com.gestalt.deepseek`. Display name is DeepSeek Gestalt. Feed is GitHub Releases on `BeiKeJieDeLiuLangMao/deepseek-harness-gestalt` (`gestalt-v*` tags, non-prerelease). Each macOS target installs and deploys on a matching runner architecture before notarization with the 千机 team identity; Windows ships unsigned NSIS and still updates. Downloaded updates never install on an ordinary quit.

Desktop adds a `--patch` overlay only: GESTALT badge, a drag strip, and the Update Control to the right of Settings. Browser `dsh web` does not load that overlay. Dock launch sets the Web Host cwd to `~/Library/Application Support/DeepSeek Gestalt/defaultWorkspace` (Windows: `%APPDATA%\DeepSeek Gestalt\defaultWorkspace`) so the process cwd is not the install directory. Session Surface, `~/.dsh`, and the web profile stay shared.

The macOS chrome reserves a fixed top inset for the traffic lights while preserving the DSH sidebar header and collapse interaction. Windows uses a full-window drag row with three non-drag caption buttons. Unsupported development platforms keep their system frame.

## Alternatives considered

**Electron as the Web Host (`ELECTRON_RUN_AS_NODE`).** This rebuilds every native addon against Electron's ABI and forks engine behavior from CLI `dsh web`.

**One workspace per window, as in 千机·Gestalt.** The existing Session Surface already lists every Workspace in one sidebar.

**Official `deepseek-ai/deepseek-harness` Releases as the first feed.** The origin remote is the personal fork; moving the feed later breaks already-installed updaters.

**Authenticode on Windows before shipping updates.** electron-updater can update an unsigned NSIS install; SmartScreen is the cost. Mac still requires notarization.

**Replace the native directory picker with Electron's dialog.** That would change a Web Host capability. Desktop only adds the Apple Events entitlement so the existing osascript picker can run under Hardened Runtime.

## Verification

- `pnpm gestalt:dev` starts Desktop Host, which starts Web Host and loads `window.__DSH_BOOT__` at a loopback URL (not a bare Vite server).
- Browser `dsh web` keeps the HARNESS badge, has no drag strip, and has no Update Control.
- Desktop composition shows the GESTALT badge, a drag strip above the logo row, and the Update Control on the same foot row as Settings.
- macOS expanded and collapsed layouts keep the unchanged sidebar controls below native controls; Windows keeps its caption buttons at the right edge of the full-window drag row.
- Dock-style spawn uses the Launch Directory as cwd and does not register that path as a Workspace.
- Desktop shutdown waits for pending and running Web Host processes to exit; the smoke test rejects an orphaned child and missing Desktop composition.
- The keyless browser golden boots the shipped Web profile plus Desktop overlay; release jobs verify Node archive digests and smoke each packaged target before upload.
- Unit tests cover URL discovery from the `dsh web:` line, Launch Directory resolution, and updater phase transitions without downloading.

## Consequences

- A Desktop release is a snapshot of `dsh` plus Electron. The private Desktop app is not an npm `dsh` release-family member, so both version lines remain independent.
- The notarized Mac identity belongs to the 千机 Apple team. Changing the app id later is a new application.
- Windows users see SmartScreen until an Authenticode certificate exists.
- The personal GitHub feed is the product feed; there is no migration path that preserves updates for already-installed builds.
