# Agent Note: Declared Electron Browser Runtime e2e launcher

Status: implemented

English | [中文](2026-08-20-electron-runtime-e2e-launcher.zh.md)

## Problem

`packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` already drives a real page and proves two-partition Chromium cookie isolation, but `describe.skipIf(!isElectronProcess())` keeps those cases skipped on every Node vitest run. No package script, CI job, or Desktop smoke launched vitest inside Electron, so #69's cookie-jar acceptance stayed unexecuted locally and in CI.

## Decision

`pnpm run test:electron-runtime-e2e` is the only declared launch mode for those cases. The Node wrapper `scripts/run-electron-runtime-e2e.ts` resolves the Electron binary from `@deepseek-ai/dsh-browser-runtime-electron` and spawns `scripts/electron-runtime-e2e-main.mjs` as an application. Linux adds `--no-sandbox` and `--disable-dev-shm-usage`; Windows adds `--no-sandbox` and `--disable-gpu`. The child environment drops `NODE_OPTIONS` so a parent `tsx --import` from `pnpm run` does not become Electron argv. The wrapper bundles `packages/browser/browser-runtime-electron/tests/runtime.e2e.cases.ts` with the esbuild that `tsx` pins, leaving `electron` external, and passes that path as `DSH_ELECTRON_RUNTIME_E2E_CASES`. The main process sets an isolated `userData` and subscribes to `app.whenReady()` without top-level await — Electron emits ready only after the main module finishes evaluating. After ready it imports that bundle and runs `runElectronRuntimeE2eCases()` on this Electron main thread so `session.fromPartition` and hidden `BrowserWindow` stay available. `ELECTRON_RUN_AS_NODE` is rejected: that mode cannot host `BrowserWindow`. Node `pnpm run test:e2e` still records the named skip and must not spawn Tandem.app. The same cases module is what the Electron-gated `runtime.e2e.ts` describe would run if this process were already Electron.

The required Windows owner is `ci-windows-complete` (`windows node 24 / native complete` and the self-hosted Windows standby). macOS pull requests run `macos electron runtime e2e`; `desktop-release.yml` pack-mac and pack-win run the same script. Linux inventories omit the launcher because Desktop Host does not ship this Provider on Linux.

## Alternatives considered

**`ELECTRON_RUN_AS_NODE=1` plus vitest forks.** `process.versions.electron` can stay set while `BrowserWindow` and `session` do not, so the skip gate would go green and the cookie cases would still not run.

**`startVitest` inside Electron, any top-level `await app.whenReady()`, Node `--import tsx/esm` on Electron argv, or tsx load hooks after ready.** Electron emits ready only after the main module finishes evaluating, so a top-level await on that promise deadlocks. An in-process vitest pool has the same handshake deadlock. Chromium treats `--import` as a switch, so that argv never loads TypeScript and can keep `app.whenReady()` from settling. tsx's load hook returns a null source for the `electron:` scheme on this Electron version.

**Rewrite the cases as a Playwright Electron remote driver.** The existing tests compose `ElectronBrowserRuntime` in-process and assert this process's partitions; a remote driver would change the subject.

**Enable the disabled `serial / macos` aggregate.** That job is the full primary Node inventory, not the Desktop/Electron owner, and would hide this lane inside an unrelated serial run.

## Consequences

Cookie-jar isolation is a required green-or-red result on native Windows complete and on the macOS Electron e2e job. Contributors run one script; improvising a per-run Electron spawn is out of policy. The [in-process Electron Runtime note](../feature/2026-08-19-electron-browser-runtime.md) records the Provider; this note records the launch mode.

## Testing

- `pnpm exec vitest run scripts/run-electron-runtime-e2e.spec.ts scripts/run-gates.spec.ts scripts/ci-workflow.spec.ts`
- `pnpm run test:electron-runtime-e2e` on a host with the workspace `electron` binary
- Node `pnpm exec vitest run --config vitest.e2e.config.ts packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` still records the skip
