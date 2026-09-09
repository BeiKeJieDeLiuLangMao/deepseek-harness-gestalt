---
description: "The official Session workbench: right and bottom DockKit surfaces, global preferences, descriptor and viewer inventories, persistence, navigation, and close lifecycle."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

English | [中文](README.zh.md)

## Summary

This package owns the official per-Session workbench and the single browser projection of its global preferences. One session-scoped `workbench` seat holds right and bottom DockKit layouts, floating panes, persistent tab payloads and pins, occurrence lifetimes, navigation, and close coordination. It portals both dock surfaces into stable hosts supplied by `ui-layout`, while the conversation header's corner seat provides the right-surface expand button.

## Table of Contents

- [Ownership and presentation](#ownership-and-presentation)
- [State and persistence](#state-and-persistence)
- [Descriptor and viewer inventories](#descriptor-and-viewer-inventories)
- [Global preferences and frame](#global-preferences-and-frame)
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

The right surface stays mounted while collapsed. Its expand control lives in `conversation.session.header.corner` and shares the Session store. Without a current Session, neither surface mounts. The frame accepts a first-width seed once: the retained `dsh-sidebar:v1:width` value wins when present, otherwise `defaultWidthPercent` supplies it. Reading that legacy value never changes or deletes the rollback key.

The Dock add control opens the guide in Web mode. In Desktop, it sends the observable official page definitions to the native overlay menu, excluding the guide, hidden types, and resource types; unavailable entries remain visible but disabled. A selection opens through `ctx.sidebarRight` in the pane whose control supplied the anchor.

<a id="state-and-persistence"></a>
## State and persistence

Each Session owns two `DockSurfaceState` values, a shared minted-id cursor, bottom height and first-open marker, per-tab payload and pin metadata, and namespaced JSON data. Store actions use DockKit planners and commit both surfaces atomically to the Tab domain. A duplicate tab id across the surfaces is rejected instead of publishing a partial occurrence set. A fresh non-persisted Session reads `openByDefault`; narrow viewports still start collapsed. A restored or migrated Session keeps its recorded expansion.

The browser adapter stores `dsh-sidebar-workbench:v1:<sessionId>`. The versioned codec validates the complete layout graph, tab metadata, bottom geometry, and JSON data. Reversible layout history remains process-local. An unknown or malformed official version is preserved and blocks automatic overwrite so recovery remains possible.

When no official document exists, the adapter can adopt `dsh-sidebar:v1:<sessionId>` from Better Sidebar. Conversion remints unique ids across right, bottom, and floats, retains unknown tab kinds and JSON metadata, converts terminal pins, and keeps selected legacy tombstone and counter data under `legacy.ui-better-sidebar`. The official document is written before it is selected. The legacy key remains byte-for-byte available for rollback. A failed write selects the fresh default and leaves the legacy document unchanged.

<a id="descriptor-and-viewer-inventories"></a>
## Descriptor and viewer inventories

A tab type registers in two stages inside one effect:

1. `ctx.sidebarRightTabs.register(definition)` declares routing, initial title, inventory order/visibility/icon, availability, badge, single or keyed deduplication, pure creation, open/activate notifications, URL claims, settings rows, guide entries, and optional true-close lifecycle. `onOpen` runs once only after a new occurrence commits; a dedupe or content reveal runs `onActivate`, as does a tab-strip focus. `id` identifies the implementation and keys its body registration. Definitions receive only Session, preference, occurrence, navigation, payload, and pin facts; they never receive React nodes, Cordis contexts, or stores. One builtin and one extension may share a kind; the extension is in force until it unregisters.
2. `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` supplies the body. The optional `.title` seat supplies a live chip title. `sidebar.right.tab.icon` and `sidebar.right.viewer.icon` accept custom keyed icons; the matching `.settings` seats accept a custom settings body when `settings.custom` is true. `props.useTabInfo()` returns the display surface and pane plus the authoritative record's Session, payload, pin, navigation, visibility, occurrence signal, and home-bound actions.

A resource type declares address globs. Patterns containing `:` match the complete URI; other patterns match the URI path. Candidates are ranked by priority band, matched-pattern length, and registration order. A page type omits patterns and opens by kind. Unknown persisted kinds remain visible through the unavailable fallback and can recover when their definition registers again.

File viewers use the same lifetime owner through `registerViewer(definition)`. A viewer declares a stable id, copy and icon token, lowercase extensions, numeric priority, fetch strategy, optional head-byte detector, optional abortable JSON/byte loader, and pure settings rows. `matchViewer({ address, path, head? })` sorts by priority and registration order, tries each detector before that viewer's extensions, lets a detector-only catch-all yield until bytes arrive, and skips ids explicitly disabled in `viewersEnabled`. Viewer components remain keyed Slot contributions; no component crosses the registry.

Both registration methods return exact, idempotent disposers and also live in the caller's Cordis effect, so HMR removes only that contribution. Tab and viewer inventories are observable. `matchUrlTarget(url)` checks enabled tab definitions in registration order and contains a throwing predicate before continuing.

`SidebarRightTabPayloadMap` is declaration-merged by kind. `openTab<K>` and `update<K>` infer that kind's payload type. The workbench snapshots payloads as lossless JSON before storing them and validates them again when loading.

<a id="global-preferences-and-frame"></a>
## Global preferences and frame

`ctx.sidebarRightPreferences` is the only browser owner of the retained `dsh-better-sidebar` Host settings namespace. Its stable snapshot contains status, writability, revision, and all 30 resolved preference fields. It preserves the existing tab/viewer enable maps and descriptor JSON blobs; missing enable entries mean enabled. `update`, `setTabEnabled`, `setViewerEnabled`, and `setPluginSetting` use settings-domain path mutations, so one descriptor never restates or erases a sibling's map entry. The established editor blob remains addressable as `pluginSettings('editor')`; a descriptor may name an established blob through `settings.settingsId` while keeping a package-qualified definition id.

`htmlViewerSafety()` gives viewer code `{ forceUnsandboxed, defaultUnsandboxed }` from the two retained HTML settings. The safe absent/malformed defaults keep both false. The official workbench also owns frame compatibility: explicit Web mode disables adaptation; otherwise Window Controls Overlay geometry wins, followed by the Desktop URL inset, the selected DSH Desktop preset, or the custom inset. Custom CSS and the compatibility marker are installed and removed with the official workbench effect.

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` claims a `dsh-resource://` address and returns `Promise<TabId>`. `openTab(kind, options?)` opens a registered page type and also returns its settled identity. Placement supports `surface`, `paneId`, `replaceTab`, `revealIfOpened`, and `activate`. `activate: false` creates or reveals an occurrence without changing pane focus or expansion and cannot be combined with replacement. Page opens additionally accept `instanceId`, `title`, typed `payload`, and `pin`; resource opens accept typed navigation `params`, payload, pin, and an explicit claiming kind. A stable instance id makes a page address repeatable, while omitting it keeps singleton page behavior.

`forSession(sessionId)` returns a stable targeted navigator and materializes the Session store even before the slot renderer visits it. It exposes open, close, update, namespaced data, and reset operations. Background restore uses this path with `activate: false`, so a cold direct child can recover without taking focus or opening a panel.

`getSnapshot()` and `subscribe()` expose a stable product projection of materialized Sessions, the mounted Session id, right and bottom expansion, bottom height, tab placement, pane visibility and focused state, persistent metadata, namespaced data, and pins. A consumer combines `mountedSessionId` with `tab.visible` to find every active tab currently drawn across split panes; `tab.active` identifies the focused pane. The official seat projects visible foreign pins into its first right pane without writing another record: their bodies read the home record, Session id, signal, navigation, payload, pin, and actions. Workspace pins follow the current Session cwd once hydrated, while global pins appear in every other Session. DockKit nodes and operation history remain internal. Mounted-Session helpers retain right-surface compatibility for focus, split, float, dock, expansion, and active-tab commands.

<a id="close-lifecycle"></a>
## Close lifecycle

Every true close runs through one serialized coordinator per Session. A batch calls every `beforeClose(context)` before changing layout. A returned `false` or rejection cancels the complete batch. After admission, every `close(context)` settles independently: fulfilled records are removed together, failed records remain, and the outcome reports both sets. Replace, reset, undo, and redo use the same path when they would remove occurrences. Runtime-owned opens and closes checkpoint reversible history.

The close context fixes the original Session, surface, record, payload, pin, signal, and reason. A Session switch during asynchronous cleanup cannot retarget it. Duplicate close requests serialize and observe the latest committed records, so an owner releases once. Component unmount and tab-type unregister are not true closes and do not invoke these hooks.

<a id="the-tab-domain"></a>
## The Tab domain

The Tab domain retains navigation, an abort signal, and bound actions per `(Session, tab id)`. Store adoption reconciles both layouts on every commit, including Sessions that are not visible. Record removal or plugin unload aborts the occurrence. Hiding a surface, switching Sessions, changing presentation, and body remounts preserve it. A restored record is a new occurrence.

`tab.actions` always target the record's own Session and surface, including `update({ pin: undefined })` from a foreign pinned view. `tab.sessionId` names that home Session and `tab.virtual` identifies the display-only projection. `tab.visible` is true for the active tab on an expanded dock surface and for visible right-side floats. Navigation revisions change independently from layout history, so reopening an existing address can deliver new parameters without remounting the body.

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser UI capability and registers no model-facing tool or prompt.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Feature migration is incomplete.** Better Sidebar still mounts a second product workbench until its viewer bodies, runtime tabs, settings UI, and consumers move to these interfaces.
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
