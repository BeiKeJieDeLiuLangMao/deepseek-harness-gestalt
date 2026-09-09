---
description: "Session-owned official Browser chrome and collapsed tab preview for the dsh web GUI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-browser

English | [中文](README.zh.md)

## Summary

Use the official Browser UI to create and navigate Session-owned pages, reopen them in the default browser, and retry rejected creation. The plugin mounts page chrome in the workbench's Browser tab and shows a collapsed preview when the conversation gutter is wide enough. Workspace projection supplies live facts; generated Browser RPC owns mutations.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

Session-owned official Browser chrome and collapsed tab preview. [`dsh-client-ui-workbench`](../ui-workbench/README.md) requires the injected `browserUi` face for current settings-derived create identity, official page chrome, and one-observe mutation recovery; it mounts it inside the snapshot `browser` tab. This plugin occupies Chat-declared `conversation.browser.preview` and registers settings section `id: 'browser'`. Live Workspace facts arrive through the Session standard `useProjection('browserWorkspace')` seat; mutations use the generated `remote.browserWorkspace` namespace. The page chrome carries back/forward over a pane-local trail of committed URLs and an open-in-default-browser control; a rejected create shows a retry affordance.

The collapsed preview is a layered summary of the same official pages. ChatView paints it in the right gutter of the conversation scrollport and hides that rail when the gutter is narrower than 240px. Clicking a back layer focuses that tab with its listed revision; clicking the current layer reveals the workbench tab. A listed-revision `BROWSER_REVISION_CONFLICT` on a background chip observes that tab once and retries, or shows the failure. Ordinary MCP tool rows stay in conversation history.

Settings section `id: 'browser'` under namespace `ui-browser` holds a named persistent Profile roster and the default create identity (`shared` / `temporary` / `persistent`) that `browser_create` and sidebar `+ → Browser` use when the model or user omits `profile`. The create identities occupy one compact selection card, named Profiles remain display rows until an explicit rename, and Profile creation opens a dialog that returns focus to its trigger on close. Roster names are partition keys: renaming one updates the roster and follows the persistent default when that name was selected. The page does not create Browser Workspaces or migrate Chromium partition data.

The behavior is specified by the [workbench official browser Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.md) and the [Browser Dock Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-browser-dock.md).

<a id="model-experience"></a>
## Model Experience

Indirectly, through Browser Workspace mutations: focus, navigation, input, and page creation change state that `dsh-tool-browser` later renders.

#### KV Cache effect

This package adds no stable request prefix; later browser tool results reflect page operations performed through the chrome.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Desktop presents the Runtime window; `dsh web` stays screenshot-plus-text** — `window.dshDesktop.browserPresent` places the same official `webContents` over the chrome viewport. Settings and the sidebar `+` menu mount in a native overlay view above that page; that overlay document does not present or conceal pages. The refresh control spins while observe or navigate is in flight. A committed Chromium net error keeps the error document in that live view. Browser `dsh web` has no Host window and still paints observe/screenshot facts.
- **Keyless web and headless Runtimes stay deterministic** — browser `dsh web` and headless keep `dsh-browser-runtime-deterministic`. Desktop Host owns in-process Electron `webContents` and points the overlay HTTP client at that loopback origin.
- **Profile settings do not create tabs** — the Browser section writes the roster and default identity only.

No runtime invariant companion is published because Settings, slots, and Browser Workspace own the mutable relationships this adapter consumes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
