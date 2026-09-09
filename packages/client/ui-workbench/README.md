---
description: "Adapter that binds Browser Workspace pages to official Sidebar occurrences."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

Bind Browser Workspace pages to official Sidebar Browser occurrences. The Host waits for the retained settings namespace, enables Browser tabs and link interception, and cancels cleanly if disposed before activation. The Client reuses Profile-matched instances and records rejected seeded-page creation for retry.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

First-party adapter beside the retained [`better-sidebar` Host providers](../ui-better-sidebar/README.md). Host apply observes Loader and Cordis lifecycle transitions until namespace `dsh-better-sidebar` is registered, then writes `tabsEnabled.browser: true` and turns link takeover on (`browserInterceptLinks` / `browserInterceptHttps`) through `settings.get` / `settings.update`; disposal cancels an unfinished wait without a late write. The Client registers a higher-priority official `browser` definition and keyed body, including the icon, title, order, and guide description shared by the guide and `+` menu, publishes `workbenchBrowser`, and requires the `browserUi` service published by ui-browser. Browser Workspace owns Profile-matched instance reuse when `+ → Browser` creates another page. A URL-seeded occurrence navigates immediately after create; a rejected create is retained in its official payload so the chrome offers a retry. When a Runtime restart invalidates a projected target, the adapter keeps the occurrence and Profile identity while Browser Workspace replaces the missing page. True close closes the Runtime page; stale revisions are observed and retried, and transient failures retain the close intent. The official Sidebar owns per-Session placement and visibility. The Desktop overlay document publishes the face without reconciling official pages.

On Browser UI provider unload, the workbench stops new bridge actions and waits for accepted Remote operations to settle. Late replies cannot update sidebar tabs or start queued reconciliation. Rendering uses the provider callback captured during workbench activation.

Web-app composition inserts the Better Host row, then this adapter, then keeps `id: ui-browser`. Occupancy is specified by the [workbench official browser Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.md).

<a id="model-experience"></a>
## Model Experience

Indirectly, through Browser Workspace creation, navigation, and close operations whose state `dsh-tool-browser` later renders.

#### KV Cache effect

The adapter adds no stable request prefix; later browser tool results reflect human workbench operations.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Retained file/Git/PTY transports stay on `/sidebar`** — moving their UI owners does not rewrite the working Host transports.
- **Client `apply` types the root context from Cordis and Session identities from `@deepseek-ai/dsh-session/types`.** The live Session list is the Session Controller `sessions` service, not `@deepseek-ai/dsh-client-runtime`.

No runtime invariant companion is published because Sessions, Browser Workspace, and the official Sidebar expose the relationships this adapter reconciles.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
