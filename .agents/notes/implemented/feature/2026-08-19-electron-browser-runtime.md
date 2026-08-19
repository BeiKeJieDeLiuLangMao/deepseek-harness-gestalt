# Agent Note: In-process Electron Browser Runtime

Status: implemented

English | [中文](2026-08-19-electron-browser-runtime.zh.md)

## Problem

A Session-owned AI Browser needs a real Chromium engine on Desktop. Spawning Tandem Browser as a second Electron application splits process and storage ownership, writes outside DeepSeek Gestalt `userData`, and cannot embed another process's `WebContentsView` into the native Dock.

## Decision

`dsh-browser-runtime-electron` implements `BrowserRuntime` in this Desktop Host process. Named Profiles use `session.fromPartition('persist:…')`; temporary Profiles use unique partitions and discard identity on close. Hidden offscreen `BrowserWindow` instances own `webContents` for create, navigate, observe, screenshot, focus, input, takeover, returnControl, and close. Screenshots use `webContents.capturePage`; page text uses `executeJavaScript`. The plugin loads only when `process.versions.electron` is set or a test injects Electron APIs; composing it on Node fails at load. Partition files stay under Electron `userData/browser-runtime` and never write `~/Library/Application Support/Tandem Browser`.

Tandem remains the HTTP and MCP operation vocabulary, not a sidecar binary. `listenElectronBrowserHttp` copies sessions, tabs, navigate, page-content, screenshot, focus, and destroy onto a loopback origin. Desktop Host starts that engine, exports `DSH_ELECTRON_BROWSER_ORIGIN` and `DSH_ELECTRON_BROWSER_TOKEN_FILE` to the Node Web Host, and the Desktop overlay mounts `dsh-browser-runtime-tandem` as a protocol-only HTTP client. `command` and `cwd` stay optional for the in-repository HTTP fixture; production never launches Tandem.app.

The Dock stays a native pane of screenshot, title, and text. It does not embed a second BrowserView. Headless and browser `dsh web` keep `dsh-browser-runtime-deterministic`. The earlier managed-child design in the [Tandem provider Agent Note](2026-08-18-tandem-browser-runtime-provider.md) is now the protocol client only.

## Alternatives considered

**Spawn Tandem.app as a child Electron process.** Rejected because product ownership stays in this Desktop Host; a second Electron application would split partitions, userData, and Dock facts.

**Embed a live BrowserView in the Dock.** Rejected because the Dock is a Session-owned screenshot, title, and text pane; a second view would split page identity from the Workspace projection.

**Load the Electron Provider inside the Node Web Host.** Rejected because `dsh web` is a Node child without `process.versions.electron`; the Host owns Chromium and publishes Tandem-shaped HTTP to that child.

**Delete the tandem package.** Rejected because HTTP fixture tests and the Web Host still need the protocol client; gutting the spawn path keeps Tandem as vocabulary without a sidecar binary.

## Consequences

Desktop owns real pages without a second Electron application. Web and headless stay keyless and deterministic. The Dock continues to render Runtime facts rather than a live view. Real Chromium e2e runs only when this process is Electron; Node coverage uses an injected Electron host and the HTTP fixture.

## Verification

- `pnpm exec vitest run packages/browser/browser-runtime-electron packages/browser/browser-runtime-tandem --coverage --coverage.include='packages/browser/browser-runtime-electron/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts'`
- `pnpm exec vitest run apps/desktop/tests/browser-runtime.spec.ts apps/desktop/tests/overlay-isolation.spec.ts`
- `pnpm run check:ci:static`
- Electron-gated e2e in `packages/browser/browser-runtime-electron/tests/runtime.e2e.ts` self-skips on Node with the named reason that this process is not Electron and must not spawn Tandem.app.
