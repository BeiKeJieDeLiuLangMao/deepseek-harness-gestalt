# Official Sidebar Workbench

English | [中文](sidebar-right.zh.md)

The official Sidebar workbench is the Web Client's per-Session home for addressed resources and product pages. It owns right and bottom DockKit surfaces, right-side floats, persistent occurrence metadata, routing, close lifecycle, and a stable read projection. [`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.md) owns the product capability; [`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.md) remains its internal layout engine.

This page defines the subsystem contracts. Slot mechanics live in the [Slots reference](slots.md), file values in [Client Resources](client-resources.md), and the complete migration decision in [Unify Sidebar capabilities on the official workbench](../../.agents/notes/proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md).

## Ownership and placement

One session-scoped `workbench` entry owns both dock surfaces and one store instance. [`ui-layout`](../../packages/client/ui-layout/README.md) renders stable right and bottom DOM hosts and passes their ids plus frame geometry as `WorkbenchOwnerProps`. The workbench resolves those ids in a layout effect and portals both surfaces from one React tree. The right host spans the frame height. The bottom host is inside the center column, so a bottom track reduces only the conversation row.

| `WorkbenchOwnerProps` field | Meaning |
|---|---|
| `rightHostId`, `bottomHostId` | Stable ids of frame-owned DOM hosts. |
| `viewportWidth`, `viewportHeight` | Last positive frame measurements. |
| `centerWidth` | Center width after current track reservations. |
| `rightPanelWidth` | Prospective normal width used to draw the right panel. |
| `rightbarWidth` | Width currently reserved by the right track; zero when no track is requested. |
| `canShowRight` | Whether a normal right panel can retain its minimum beside the protected center. |
| `setRightbarWidth(width)` | Frame-owned clamped width write used by workbench resize gestures. |

The right surface supports push, wide fullscreen with a retained track, automatic fullscreen below 768px, two horizontal panes, and floats. The bottom surface has independent panes, history, height, expansion, and fullscreen state. Bottom fullscreen reserves zero row height, and bottom tabs do not float. Both surfaces share one minted-id cursor and occurrence domain.

## Addresses and identity

A resource address is a `dsh-resource://<type>/…` URL. The lower-cased host is a key in `ResourceProtocolMap`; the remainder belongs to that protocol. `fileAddressFor(sessionId, cwd, path)` builds file addresses and `parseFileAddress(address)` reads them ([grammar](../../packages/util/workspace-path/README.md)). The resource model retains one live value per address while `useResource` subscribers or occurrence pins hold it.

A page opens by kind. `openTab(kind)` records the opaque singleton address `sidebar://<kind>`. `openTab(kind, { instanceId })` records `sidebar://<kind>/<encoded-instance-id>`, allowing stable multi-instance identity. Callers provide the kind and optional instance id and never compose these addresses.

An occurrence is one tab record with a unique `TabId`. `revealIfOpened: true` focuses an existing record with the same kind and content identity. `false` creates another occurrence. Right, bottom, and floats share the id space, and the persistence decoder rejects duplicates.

## Tab-type registration

`ctx.sidebarRightTabs.register(definition)` registers one implementation for the caller's effect lifetime and returns its disposer. One builtin and one extension may share a kind; the extension is in force until it unregisters. A duplicate definition id or any other kind collision throws.

| `SidebarRightTabDefinition` field | Meaning |
|---|---|
| `id` | Globally unique implementation identity and keyed body/title registration key. |
| `kind` | Page or resource discriminator named by `openTab` and stored on records. |
| `patterns` | Optional resource-address globs. A page type omits them. |
| `priority` | `extension`, `builtin`, or `fallback`; omitted means `extension`. |
| `canOpen(address)` | Optional synchronous veto after a resource pattern matches. |
| `title(address)` | Initial record title captured when an occurrence opens. |
| `guide` | Optional ordered guide entries. |
| `beforeClose(context)` | Optional asynchronous admission. `false` or rejection cancels the whole batch. |
| `close(context)` | Optional asynchronous owner release. A rejected release keeps that record. |

Resource candidates rank by priority band, longest matching pattern, and registration order. A pattern containing `:` matches the complete address; another pattern matches the URI path. A named kind bypasses pattern ranking but still runs `canOpen`.

A definition's body registers under `sidebar.right.pane.tab` with `key: definition.id`; a live title may register under `sidebar.right.pane.tab.title`. `sidebar.right.tab.guide` is a chain replacement for the shipped guide body. `sidebar.right.tab.menu.item` appends content actions after DockKit's layout actions.

`useTabInfo()` returns `workbench.surface`, right-sidebar presentation, the containing pane, and the occurrence. The occurrence includes its record, visibility, navigation, persistent `payload`, optional `pin`, `AbortSignal`, and Session-bound actions. A kind extends `SidebarRightTabPayloadMap` to type `openTab<K>` and `update<K>` payloads. The value must be lossless JSON.

## Navigation and projection

`ctx.sidebarRight` exposes the mounted-Session commands below. `forSession(sessionId)` returns the same state operations targeted at an explicit Session and materializes its store before first render.

| Operation | Result and behavior |
|---|---|
| `openResource(address, options?)` | `Promise<TabId>`; claims a resource, places or reveals it, expands the selected surface, and records navigation parameters. |
| `openTab(kind, options?)` | `Promise<TabId>`; opens a singleton or caller-identified page instance. |
| `close(tabId)` | `Promise<SidebarRightCloseOutcome>` with admission, closed ids, and release failures. |
| `update(tabId, patch)` | Replaces title, typed JSON payload, or pin without changing occurrence identity. |
| `setData(key, value)` | Stores or deletes namespaced Session JSON. |
| `reset()` | Closes all current occurrences through lifecycle hooks, then creates fresh surfaces if every release succeeds. |

Placement options are `surface`, `paneId`, `replaceTab`, and `revealIfOpened`. Resource options additionally carry claiming `kind`, typed `params`, payload, and pin. Page options additionally carry `instanceId`, title, typed payload, and pin. Replacing a tab waits for its close outcome before committing the new occurrence.

`getSnapshot()` and `subscribe()` expose `SidebarRightProjection`: materialized Sessions, `mountedSessionId`, right and bottom expansion, bottom height, namespaced data, pins, and every tab's Session, surface, pane, floating, visible and active flags, record, and persistent state. `visible` means the record is its pane's selected tab and its surface is expanded, or it is a right-side float; consumers combine it with `mountedSessionId` to select current rendered content. `active` additionally means the pane has focus. DockKit nodes and operation history are not public. Mounted-Session compatibility methods retain right-side active, expansion, focus, split, float, and dock behavior.

## Close and occurrence lifecycle

One serialized coordinator per Session owns all record-removal transactions. It resolves every admission before state changes. After admission, owner releases settle independently; successful records commit together and failed records remain. Close, replace, reset, undo, and redo use the same coordinator when they remove records. Runtime-owned changes checkpoint history so reversible layout operations cannot replay an already released external owner.

`SidebarRightTabCloseContext` contains the original `sessionId`, `surface`, tab record, payload, pin, occurrence signal, and reason (`close`, `replace`, `reset`, `undo`, or `redo`). Session switches cannot retarget pending cleanup. Duplicate requests serialize against the latest committed state.

Store adoption reconciles both layouts after every commit, including Sessions that are not rendered. An occurrence signal aborts when its record disappears or the plugin unloads. Hiding, Session switching, split, float, fullscreen, and body remount do not abort it. Definition unload shows the unavailable fallback while preserving the record and payload; it is not a user close.

## Persistence

The official document key is `dsh-sidebar-workbench:v1:<sessionId>`. The codec stores both layouts, floats, shared minted count, bottom height and first-open marker, per-tab payloads and pins, and namespaced JSON. History resets at process start. Unknown or malformed official versions remain untouched and block automatic overwrite.

When the official key is absent, the adapter may convert `dsh-sidebar:v1:<sessionId>`. It remints ids across right, bottom, and floats; preserves unknown kinds and JSON metadata; converts supported pins; and carries selected Better tombstone/counter data under a namespaced JSON key. It writes the official document before selecting it and never removes or rewrites the legacy key. A failed write selects fresh state for the current process and leaves rollback data intact.

## Related packages

- [`ui-sidebar-textpreview`](../../packages/client/ui-sidebar-textpreview/README.md) registers the fallback `text` resource type.
- [`ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.md) registers the `files` page.
- [`api/workspace-files`](../../packages/api/workspace-files/README.md) provides bounded file metadata, text, bytes, directory listing, and change streams.
- [`resources`](../../packages/client/resources/README.md) owns resource providers, caching, and holder lifetime.

## Current limits

- The Better Sidebar capability migration is incomplete, so the product composition still has a second workbench owner until its consumers and runtime tabs move.
- The official document is browser-local best-effort persistence and has no user-facing import/export command.
- Bottom-specific copy, first-open Terminal policy, tab icons, enablement inventory, URL claims, viewer inventory, and settings declarations remain part of the capability migration.
- Close failures are returned to callers; a shared user-facing error presentation is not yet registered.
