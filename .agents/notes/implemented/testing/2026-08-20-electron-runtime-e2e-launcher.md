# Agent Note: Declared Electron Browser Runtime e2e launcher

Status: implemented

English | [中文](2026-08-20-electron-runtime-e2e-launcher.zh.md)

## Problem

`packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` already drives a real page and proves two-partition Chromium cookie isolation, but `describe.skipIf(!isElectronProcess())` keeps those cases skipped on every Node vitest run. No package script, CI job, or Desktop smoke launched vitest inside Electron, so #69's cookie-jar acceptance stayed unexecuted locally and in CI.

## Decision

`pnpm run test:electron-runtime-e2e` is the only declared launch mode for those cases. The Node wrapper `scripts/run-electron-runtime-e2e.ts` resolves the Electron binary from `@deepseek-ai/dsh-browser-runtime-electron` and spawns `scripts/electron-runtime-e2e-main.mjs` as an application. Linux adds `--no-sandbox` and `--disable-dev-shm-usage`; Windows adds `--no-sandbox` and `--disable-gpu`. The main process sets an isolated `userData`, waits for `app.whenReady()`, registers `tsx/esm`, and runs `runElectronRuntimeE2eCases()` from `packages/browser/browser-runtime-electron/tests/runtime.e2e.cases.ts` on this Electron main thread so `session.fromPartition` and hidden `BrowserWindow` stay available. `ELECTRON_RUN_AS_NODE` is rejected: that mode cannot host `BrowserWindow`. Node `pnpm run test:e2e` still records the named skip and must not spawn Tandem.app. The same cases module is what the Electron-gated `runtime.e2e.ts` describe would run if this process were already Electron.

The required Windows owner is `ci-windows-complete` (`windows node 24 / native complete` and the self-hosted Windows standby). macOS pull requests run `macos electron runtime e2e`; `desktop-release.yml` pack-mac and pack-win run the same script. Linux inventories omit the launcher because Desktop Host does not ship this Provider on Linux.

## Alternatives considered

**`ELECTRON_RUN_AS_NODE=1` plus vitest forks.** `process.versions.electron` can stay set while `BrowserWindow` and `session` do not, so the skip gate would go green and the cookie cases would still not run.

**`startVitest` inside Electron with an in-process custom pool.** The worker `setup` RPC waits for the orchestrator `started` handshake in the same isolate, so the lane hangs before any case runs.

**Rewrite the cases as a Playwright Electron remote driver.** The existing tests compose `ElectronBrowserRuntime` in-process and assert this process's partitions; a remote driver would change the subject.

**Enable the disabled `serial / macos` aggregate.** That job is the full primary Node inventory, not the Desktop/Electron owner, and would hide this lane inside an unrelated serial run.

## Consequences

Cookie-jar isolation is a required green-or-red result on native Windows complete and on the macOS Electron e2e job. Contributors run one script; improvising a per-run Electron spawn is out of policy. The [in-process Electron Runtime note](../feature/2026-08-19-electron-browser-runtime.md) records the Provider; this note records the launch mode.

## Testing

- `pnpm exec vitest run scripts/run-electron-runtime-e2e.spec.ts scripts/run-gates.spec.ts scripts/ci-workflow.spec.ts`
- `pnpm run test:electron-runtime-e2e` on a host with the workspace `electron` binary
- Node `pnpm exec vitest run --config vitest.e2e.config.ts packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` still records the skip
