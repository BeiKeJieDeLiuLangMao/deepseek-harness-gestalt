---
description: "Adapter that mounts the better-sidebar snapshot and binds official Browser pages to its browser tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

Mount the pinned Better Sidebar snapshot and bind official Browser Workspace pages to its Browser tab. The Host waits for the snapshot namespace, enables Browser tabs and link interception, and cancels cleanly if disposed before activation. The Client reuses Profile-matched instances and records rejected seeded-page creation for retry.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

First-party adapter beside the [`better-sidebar` snapshot](../ui-better-sidebar/README.md). Host apply observes Loader and Cordis lifecycle transitions until the snapshot loader fiber activates and namespace `dsh-better-sidebar` is registered, joining that fiber while registration is pending. It propagates a failure from the snapshot row while ignoring unrelated Loader failures, then writes `tabsEnabled.browser: true` and turns link takeover on (`browserInterceptLinks` / `browserInterceptHttps`) through `settings.get` / `settings.update` on that literal namespace; disposal cancels an unfinished wait without a late write. The client half publishes `workbenchBrowser`, requires the `browserUi` service published by ui-browser, and binds each official Workspace page to one snapshot `browser` tab. Browser Workspace owns Profile-matched instance reuse when `+ → Browser` creates another page. A tab opened with a seed URL navigates to it right after create; a rejected create is recorded on the tab meta so the chrome offers a retry instead of a perpetual creating placeholder. When a Runtime restart invalidates a projected target, the adapter keeps the sidebar tab and its Profile identity while Browser Workspace replaces the missing page. Closing a sidebar tab closes the Runtime page; stale revisions are observed and retried, and transient failures retain the close intent instead of reopening the tab. Better-sidebar owns per-Session panel visibility. The Desktop overlay document publishes the face without reconciling official pages. Daily product changes belong here, not in the snapshot tree.

On Browser UI provider unload, the workbench stops new bridge actions and waits for accepted Remote operations to settle. Late replies cannot update sidebar tabs or start queued reconciliation. Rendering uses the provider callback captured during workbench activation.

Web-app composition inserts the snapshot row, then this adapter, then keeps `id: ui-browser`. Occupancy is specified by the [workbench official browser Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.md).

<a id="model-experience"></a>
## Model Experience

Indirectly, through Browser Workspace creation, navigation, and close operations whose state `dsh-tool-browser` later renders.

#### KV Cache effect

The adapter adds no stable request prefix; later browser tool results reflect human workbench operations.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Snapshot fs/git/pty stay on `/sidebar`** — this phase does not migrate them onto official `fs` or `terminal` capability seams.
- **Client `apply` types the root context from Cordis and Session identities from `@deepseek-ai/dsh-session/types`.** The live Session list is the Session Controller `sessions` service, not `@deepseek-ai/dsh-client-runtime`.

No runtime invariant companion is published because Sessions and Better Sidebar own the snapshots this adapter reconciles, and the adapter retains no independent authority.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
