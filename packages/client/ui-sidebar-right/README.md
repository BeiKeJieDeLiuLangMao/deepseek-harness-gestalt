---
description: "The official Session workbench: right and bottom DockKit surfaces, persistence, navigation, typed tab payloads, close lifecycle, and extension slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

English | [中文](README.zh.md)

## Summary

This package owns the official per-Session workbench. One session-scoped `workbench` seat holds right and bottom DockKit layouts, floating panes, persistent tab payloads and pins, occurrence lifetimes, navigation, and close coordination. It portals both dock surfaces into stable hosts supplied by `ui-layout`, while the conversation header's corner seat provides the right-surface expand button.

## Table of Contents

- [Ownership and presentation](#ownership-and-presentation)
- [State and persistence](#state-and-persistence)
- [Extension seats](#extension-seats)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [Close lifecycle](#close-lifecycle)
- [The Tab domain](#the-tab-domain)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="ownership-and-presentation"></a>
## Ownership and presentation

`ui-dockkit` remains the pure layout engine. This package assigns product meaning to tab kinds, seeds empty panes with the guide, renders tab bodies through keyed slots, and owns the state that survives component remounts. Right, bottom, and floating presentations share one id cursor and one occurrence domain, so a record has one identity across the complete Session workbench.

The workbench resolves `rightHostId` and `bottomHostId` after the frame mounts, then portals both surfaces from one React and store tree. The right surface supports push, wide fullscreen with an underlying track, automatic fullscreen below 768px, two horizontal panes, and floating panels. The bottom surface has an independent split tree, height, open state, and fullscreen mode. Its push presentation consumes only the center column; fullscreen consumes no center-row height. The bottom surface owns its top-edge height drag and the shared corner gesture that can change bottom height and right width together. Bottom tabs never create floats.

The right surface stays mounted while collapsed. Its expand control lives in `conversation.session.header.corner` and shares the Session store. Without a current Session, neither surface mounts.

<a id="state-and-persistence"></a>
## State and persistence

Each Session owns two `DockSurfaceState` values, a shared minted-id cursor, bottom height and first-open marker, per-tab payload and pin metadata, and namespaced JSON data. Store actions use DockKit planners and commit both surfaces atomically to the Tab domain. A duplicate tab id across the surfaces is rejected instead of publishing a partial occurrence set.

The browser adapter stores `dsh-sidebar-workbench:v1:<sessionId>`. The versioned codec validates the complete layout graph, tab metadata, bottom geometry, and JSON data. Reversible layout history remains process-local. An unknown or malformed official version is preserved and blocks automatic overwrite so recovery remains possible.

When no official document exists, the adapter can adopt `dsh-sidebar:v1:<sessionId>` from Better Sidebar. Conversion remints unique ids across right, bottom, and floats, retains unknown tab kinds and JSON metadata, converts terminal pins, and keeps selected legacy tombstone and counter data under `legacy.ui-better-sidebar`. The official document is written before it is selected. The legacy key remains byte-for-byte available for rollback. A failed write selects the fresh default and leaves the legacy document unchanged.

<a id="extension-seats"></a>
## Extension seats

A tab type registers in two stages inside one effect:

1. `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, beforeClose?, close? })` declares routing, initial title, guide entries, and optional true-close lifecycle. `id` identifies the implementation and keys its body registration. One builtin and one extension may share a kind; the extension is in force until it unregisters.
2. `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` supplies the body. The optional `.title` seat supplies a live chip title. `props.useTabInfo()` returns the workbench surface, sidebar presentation, pane, record, persistent payload and pin, navigation revision, visibility, occurrence signal, and tab-bound actions.

A resource type declares address globs. Patterns containing `:` match the complete URI; other patterns match the URI path. Candidates are ranked by priority band, matched-pattern length, and registration order. A page type omits patterns and opens by kind. Unknown persisted kinds remain visible through the unavailable fallback and can recover when their definition registers again.

`SidebarRightTabPayloadMap` is declaration-merged by kind. `openTab<K>` and `update<K>` infer that kind's payload type. The workbench snapshots payloads as lossless JSON before storing them and validates them again when loading.

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` claims a `dsh-resource://` address and returns `Promise<TabId>`. `openTab(kind, options?)` opens a registered page type and also returns its settled identity. Placement supports `surface`, `paneId`, `replaceTab`, and `revealIfOpened`. Page opens additionally accept `instanceId`, `title`, typed `payload`, and `pin`; resource opens accept typed navigation `params`, payload, pin, and an explicit claiming kind. A stable instance id makes a page address repeatable, while omitting it keeps singleton page behavior.

`forSession(sessionId)` returns a stable targeted navigator and materializes the Session store even before the slot renderer visits it. It exposes open, close, update, namespaced data, and reset operations. This is the path for background delivery and inactive-Session actions.

`getSnapshot()` and `subscribe()` expose a stable product projection of materialized Sessions, the mounted Session id, right and bottom expansion, bottom height, tab placement, pane visibility and focused state, persistent metadata, namespaced data, and pins. A consumer combines `mountedSessionId` with `tab.visible` to find every active tab currently drawn across split panes; `tab.active` identifies the focused pane. DockKit nodes and operation history remain internal. Mounted-Session helpers retain right-surface compatibility for focus, split, float, dock, expansion, and active-tab commands.

<a id="close-lifecycle"></a>
## Close lifecycle

Every true close runs through one serialized coordinator per Session. A batch calls every `beforeClose(context)` before changing layout. A returned `false` or rejection cancels the complete batch. After admission, every `close(context)` settles independently: fulfilled records are removed together, failed records remain, and the outcome reports both sets. Replace, reset, undo, and redo use the same path when they would remove occurrences. Runtime-owned opens and closes checkpoint reversible history.

The close context fixes the original Session, surface, record, payload, pin, signal, and reason. A Session switch during asynchronous cleanup cannot retarget it. Duplicate close requests serialize and observe the latest committed records, so an owner releases once. Component unmount and tab-type unregister are not true closes and do not invoke these hooks.

<a id="the-tab-domain"></a>
## The Tab domain

The Tab domain retains navigation, an abort signal, and bound actions per `(Session, tab id)`. Store adoption reconciles both layouts on every commit, including Sessions that are not visible. Record removal or plugin unload aborts the occurrence. Hiding a surface, switching Sessions, changing presentation, and body remounts preserve it. A restored record is a new occurrence.

`tab.actions` always target the record's own Session and surface. `tab.visible` is true for the active tab on an expanded dock surface and for visible right-side floats. Navigation revisions change independently from layout history, so reopening an existing address can deliver new parameters without remounting the body.

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser UI capability and registers no model-facing tool or prompt.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Feature migration is incomplete.** Better Sidebar still mounts a second product workbench until its viewers, runtime tabs, settings, and consumers move to these interfaces.
- **Official persistence is best effort.** Browser storage failure keeps the current in-memory Session usable but does not provide a user-facing export command.
- **Bottom chrome uses the shared Sidebar vocabulary.** Product-specific bottom labels and first-open Terminal behavior remain with the feature migration.
- **Undo controls are internal.** The close-aware history methods exist for tests and future product controls.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The delivery decision and remaining capability matrix are recorded in [Unify Sidebar capabilities on the official workbench](../../../.agents/notes/proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md).

</details>

**Runtime invariant:** No companion is published. The registry and controller are provided in one plugin lifetime. Store adoption is the authoritative event stream for occurrence and projection reconciliation; package tests assert off-screen materialization, dual-surface atomicity, persistence selection, and close outcomes.
