# Agent Note: Tandem macOS and Windows qualification

Status: implemented

English | [中文](2026-08-19-tandem-macos-windows-qualification.zh.md)

## Problem

The managed Tandem Browser Provider can open, navigate, screenshot, and close a real child, but the existing env-gated e2e treated the host as implied POSIX. Windows homes, PATH lookup, PATHEXT, APPDATA data directories, and native-messaging host scans differ from macOS. Wine can exercise win32 Node toolchain branches, but it is not a native Tandem host. A green fixture suite therefore cannot claim macOS and Windows qualification.

## Decision

Real Tandem qualification stays on the existing Provider and `packages/browser/browser-runtime-tandem/tests/runtime.e2e.ts`. The suite still self-skips without `DSH_TANDEM_CHECKOUT` and `DSH_TANDEM_BIN`. When those variables are set, it admits only `darwin` and `win32`, refuses Wine, creates one scratch home through `isolateTandemHost`, launches Electron once with that HOME and `--user-data-dir`, and drives create → navigate → screenshot → close against the pinned Tandem revision. `afterEach` disposes the Provider and deletes the scratch home so the child cannot remain after the case. Failures wrap the thrown value as `<platform>: <command>: <detail>`.

`isolateTandemHost` names the platform differences the child actually reads. macOS sets `HOME`, writes `~/.tandem/config.json` plus `api-token`, and uses `Library/Application Support/Tandem Browser` as the Electron user-data directory; native-host isolation covers Chrome and Tandem directories under that scratch tree. Windows sets `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `PATH`, and `PATHEXT`; the data directory is `%APPDATA%/Tandem Browser`; the user-data directory is `%LOCALAPPDATA%/Tandem Browser`; native-host isolation covers `%LOCALAPPDATA%/Google/Chrome/User Data/NativeMessagingHosts`. An isolated launcher prepends the Electron directory to PATH and never points Chromium at the operator's real Tandem profile.

Wine remains the required pull-request win32 toolchain job (`pnpm run check:windows-wine`). It cannot satisfy this suite: `WINEPREFIX`, `WINELOADER`, or `DSH_TANDEM_WINE=1` fail as `Windows: pnpm run check:windows-wine: Wine is diagnostic only…`. Native Windows CI owns the platform matrix. Linux is out of scope and is not presented as a supported qualification host.

This writer ran the isolation unit suite on macOS and one isolated real-launch case against a pinned checkout. The child used a scratch HOME and `--user-data-dir`; health passed; `browserRuntime.create` then failed as `macOS: browserRuntime.create: Tandem HTTP request failed: TimeoutError`. `afterEach` disposed the Provider and left no Tandem Electron child. A launch that reused the operator HOME or Application Support profile is not qualification evidence. Native Windows was not available in the same checkout; Wine was treated as diagnostic only. Native Windows evidence is the CI `windows-native` job plus a future env-gated run of this suite on that host.

## Alternatives considered

**Invent a second browser stack for platform proof.** Rejected because the Browser Runtime seam and Tandem Provider already own create, navigate, screenshot, and close. A parallel Playwright or Electron harness would prove a different child.

**Treat Wine as Windows qualification.** Rejected because Tandem's Windows data directory, native-messaging registry scan, PATHEXT lookup, and Electron host require a native kernel. Wine remains the fast win32 toolchain diagnostic.

**Keep the e2e POSIX-only and document Windows as implied.** Rejected because the child reads `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and `PATHEXT` on Windows. An implied host hides those differences and cannot name a Windows failure.

## Consequences

macOS and Windows are named qualification hosts for the same Tandem Provider. Contributors can run the suite locally with a pinned checkout; CI remains green when the env vars are unset. Wine cannot be mistaken for native Windows evidence. Linux stays explicitly unsupported. The [Tandem provider Agent Note](../feature/2026-08-18-tandem-browser-runtime-provider.md) still owns protocol, provenance, and reconnect semantics.

## Verification

- `pnpm exec vitest run packages/browser/browser-runtime-tandem/tests/host.spec.ts` — named platform isolation, Wine refusal, and failure wording.
- `pnpm exec vitest run --config vitest.e2e.config.ts packages/browser/browser-runtime-tandem/tests/runtime.e2e.ts` — one isolated Tandem open/navigate/screenshot/close on macOS or native Windows when `DSH_TANDEM_CHECKOUT` and `DSH_TANDEM_BIN` are set; self-skips otherwise.
- Native Windows CI (`windows-native`) owns the platform matrix; `pnpm run check:windows-wine` remains diagnostic only.
