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
| `seedRightbarWidth(width)` | One-time initial width; ignored after a seed, open, or drag. |

A tab type is two registrations that share the definition's `id`: a static definition in `ctx.sidebarRightTabs` saying which addresses its `kind` opens, and a keyed slot registration supplying its body. The framework injects `useTabInfo()` for live Sidebar, pane and tab information; each type keeps its own state in its slot store. Packages import each other's declarations only as types.

| Package | Role |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.md) | The panel and rail seats, the layout store, `ctx.sidebarRightTabs`, `ctx.sidebarRight`, the Tab domain, the guide type |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.md) | Pure layout engine and React surface; an internal dependency of `ui-sidebar-right`, not a stable interface |
| [`client/resources`](../../packages/client/resources/README.md) | `ctx.resources`, `useResource`, the protocol → value roster `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.md) | Host `ctx.workspaceFiles`, the `workspaceFiles` Remote namespace, and the Client `file` resource provider |
| [`util/workspace-path`](../../packages/util/workspace-path/README.md) | The file address grammar: `fileAddressFor`, `parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.md), [`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.md) | The shipped `text` and `files` types |

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
| `order`, `hidden`, `icon` | Add/settings inventory order, ordinary-action visibility, and renderer-independent icon token. |
| `patterns` | Optional resource-address globs. A page type omits them. |
| `priority` | `extension`, `builtin`, or `fallback`; omitted means `extension`. |
| `canOpen(address)` | Optional synchronous veto after a resource pattern matches. |
| `title(address)` | Initial record title captured when an occurrence opens. |
| `available(context)` | Pure availability hint for add actions. Direct navigation remains authoritative. |
| `single`, `dedupeKey(tab)` | Definition-wide or keyed occurrence identity across right, bottom, and floats. |
| `create(request)` | Pure identity/title/payload settlement before placement; `false` refuses creation. |
| `onOpen(tab, context)` | Notification after a new occurrence commits, exactly once for that creation. |
| `onActivate(tab, context)` | Notification after dedupe, content reveal, or tab-strip focus. |
| `badge(tab, context)` | Pure tab-strip badge value. |
| `settings` | Declarative preference/plugin rows and optional keyed custom settings body. |
| `urlTarget(url)` | Ordered external-URL claim; throwing predicates are isolated. |
| `guide` | Optional ordered guide entries. |
| `beforeClose(context)` | Optional asynchronous admission. `false` or rejection cancels the whole batch. |
| `close(context)` | Optional asynchronous owner release. A rejected release keeps that record. |

Resource candidates rank by priority band, longest matching pattern, and registration order. A pattern containing `:` matches the complete address; another pattern matches the URI path. A named kind bypasses pattern ranking but still runs `canOpen`.

A definition's body registers under `sidebar.right.pane.tab` with `key: definition.id`; a live title may register under `sidebar.right.pane.tab.title`. `sidebar.right.tab.guide` is a chain replacement for the shipped guide body. `sidebar.right.tab.menu.item` appends content actions after DockKit's layout actions.

`sidebar.right.tab.icon` and `sidebar.right.viewer.icon` are keyed custom-icon seats. The matching `.settings` seats provide custom settings bodies when the descriptor declares `settings.custom`; renderer-independent string icons and declarative rows remain in the registry. Menu entries receive the authoritative home `sessionId`, surface, record, payload, pin, and tab actions, including `update` for unpinning a foreign view.

`registerViewer(definition)` owns the file-viewer inventory. A viewer declares a stable id, text/icon token, lowercase extensions, numeric priority, fetch strategy, optional leading-byte detector, optional abortable JSON/byte loader, and settings. `matchViewer` sorts by priority then registration order, tries each detector before that viewer's extensions, lets detector-only catch-alls wait for bytes, and skips explicitly disabled viewer ids.

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

Placement options are `surface`, `paneId`, `replaceTab`, `revealIfOpened`, and `activate`. `activate: false` creates or reveals without changing focus or expansion and cannot replace a tab; cold restore uses this path. Resource options additionally carry claiming `kind`, typed `params`, payload, and pin. Page options additionally carry `instanceId`, title, typed payload, and pin. Replacing a tab waits for its close outcome before committing the new occurrence.

`getSnapshot()` and `subscribe()` expose `SidebarRightProjection`: materialized Sessions, `mountedSessionId`, right and bottom expansion, bottom height, namespaced data, pins, and every tab's Session, surface, pane, floating, visible and active flags, record, and persistent state. `visible` means the record is its pane's selected tab and its surface is expanded, or it is a right-side float; consumers combine it with `mountedSessionId` to select current rendered content. `active` additionally means the pane has focus. The official seat projects visible foreign pins into the viewer's first right pane without storing another record. `useTabInfo().tab` exposes the authoritative home Session and occurrence plus a `virtual` marker; global pins appear in every foreign Session, while workspace pins follow the viewer cwd after hydration. DockKit nodes and operation history are not public. Mounted-Session compatibility methods retain right-side active, expansion, focus, split, float, and dock behavior.

## Slots and owner props

The Sidebar declares four extension slots; its document tab declares the additional keyed document body below ([hierarchy](slots.md)).

| Slot | Cardinality | Purpose |
|---|---|---|
| `sidebar.right.pane.tab` | keyed by the definition's `id`, Session scope | One tab's body. The seat dispatches a tab to the `id` of its kind's implementation in force, so the registrant receives every tab of its kind, docked or floating. A kind whose implementation registered no body renders the owner's "nothing can view this" notice. |
| `sidebar.right.pane.tab.title` | keyed by the definition's `id`, Session scope | The chip's title, with the same owner share as the body. Optional: without an entry the chip shows the `title(address)` text captured at open time; a type with a live title reads its own store here. |
| `sidebar.right.tab.guide` | chain, Session scope | Replaces the guide tab's contents without replacing the tab; the first non-declining entry takes the body, otherwise the shipped guide renders. |
| `sidebar.right.tab.menu.item` | list, Session scope | Content-level actions appended after the kit's own layout actions. An item that acts must call the owner's `dismiss()`. |
| `sidebar.right.tab.document` | keyed by the document implementation's `id`, Session scope | The selected file renderer inside the document tab; the parent owns shared loading and toolbar controls. |

## Close and occurrence lifecycle

One serialized coordinator per Session owns all record-removal transactions. It resolves every admission before state changes. After admission, owner releases settle independently; successful records commit together and failed records remain. Close, replace, reset, undo, and redo use the same coordinator when they remove records. Runtime-owned changes checkpoint history so reversible layout operations cannot replay an already released external owner.

`SidebarRightTabCloseContext` contains the original `sessionId`, `surface`, tab record, payload, pin, occurrence signal, and reason (`close`, `replace`, `reset`, `undo`, or `redo`). Session switches cannot retarget pending cleanup. Duplicate requests serialize against the latest committed state.

Store adoption reconciles both layouts after every commit, including Sessions that are not rendered. An occurrence signal aborts when its record disappears or the plugin unloads. Hiding, Session switching, split, float, fullscreen, and body remount do not abort it. Definition unload shows the unavailable fallback while preserving the record and payload; it is not a user close.

## Global preferences and frame

`ctx.sidebarRightPreferences` is the only browser owner of the retained `dsh-better-sidebar` settings namespace. `getSnapshot()` returns `{ status, preferences, revision, writable }`; the complete value contains the 30 migrated fields. Missing tab/viewer enable entries mean enabled. Preference, enablement, viewer safety, and descriptor-plugin reads use this face, while path mutations keep sibling map/blob entries intact. An established blob can remain under a retained key such as `editor` through `settings.settingsId`.

The official workbench also applies frame preferences. Explicit Web mode disables adaptation; otherwise Window Controls Overlay geometry wins, followed by a Desktop URL inset, the selected DSH Desktop preset, or the custom inset. Custom CSS and compatibility markers have one effect-scoped owner. The frame seeds its width once from the read-only legacy `dsh-sidebar:v1:width` value or `defaultWidthPercent`; the legacy value remains untouched for rollback.

## Document renderers

The `text` tab is the shared Document Preview owner. Its [root registration](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts) declares `sidebar.right.tab.document` and provides `ctx.documentPreviews`. A renderer registers `DocumentPreviewDefinition` metadata in its own effect, then waits through `ctx.slots.inject('sidebar.right.tab.document', ...)` and registers its component with `key: definition.id` and its locale namespace. Changing the renderer does not change the tab or resource address; the [extension decision](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md) separates preview policy from resource ownership.

The [registry](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts) records unique `id`, `extensions`, localized `title()`, `loading`, optional `priority`, and optional `wrap`. Case-insensitive suffix matching ranks `extension` (the default) before `builtin`, then longer suffixes before shorter ones, then registration order. Unlike tab-kind replacement, the registry keeps all implementations available; the toolbar lists matching alternatives and remembers the selection per tab. Unknown extensions use plain text. `loading` is `text-pages` or `bytes-complete`; `wrap` advertises support for the shared source-wrap control.

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) derives from `PropsRuntime<'sidebar.right.tab.document'>`. The owner supplies the original `resourceAddress`, `content`, and current `wrap`: text content is `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`, with cumulative `text`; complete bytes are `{ kind: 'bytes', data }`, with `Uint8Array<ArrayBuffer>` data. These transient buffers are borrowed read-only and must not enter durable layout or Session JSON. PDF copies the bytes before Worker transfer, preserving the owner's buffer. The child receives the same framework-bound `useTabInfo` and the global metadata-only `useResource`. The parent reads through ordinary inject callbacks to `remote.workspaceFiles.read`/`readAll` and owns page appends, per-tab refresh, and loading status. HTML's own inject callback uses `readRelated`; Host code resolves paths. Markdown and code retain one incremental renderer across appends and settle at EOF; HTML and PDF receive complete bytes.

Preview records its loaded version and the version observed when a read starts. Refresh rereads only that tab, without changing shared metadata or another tab's content. Reads are non-transactional; versions are opaque equality tokens, not ordered timestamps ([resource observation and Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md)).

## Resource model

The model is documented in [Client Resources](client-resources.md); this section states what the Sidebar relies on. A resource is one address, and a resource address is a `dsh-resource://<type>/…` URL whose lower-cased host is the protocol key. The protocol's owning client package registers one provider with `ctx.resources.register(provider)` for its own lifetime; a second provider for the same protocol throws ([provide a protocol](../../packages/client/resources/README.md#provide-a-protocol)). A provider is `{ protocol, open(address, { signal }) }`: `open` yields `RemoteResult` frames — the current state first, one frame per later change — and stops when `signal` aborts; a failure is an `{ ok: false, error }` frame, never a throw, and a throw inside the stream is a programming error the model does not catch.

`useResource<P>(address)` is a global standard prop on every slot component, whatever its scope. It returns `{ status, value, failure }`: `none` when the address's protocol has no provider or the address is not a resource address (`sidebar://guide` names no resource), `loading` until the first frame, `live` with the latest `ok` value, `failed` with the latest frame's failure beside the last value. ([read a resource](../../packages/client/resources/README.md#read-a-resource)).

A resource stays open while it has a holder — a subscribed `useResource` or a `ctx.resources.pin(address, signal)`; the first holder opens the provider's stream, later holders share it and read the latest value at once, and the last release aborts the stream and discards the value. Streams carry metadata, not content: the `file` value is `{ absolutePath, version, bytes? }`, and a consumer reads file text itself, by page, through the Workspace Files service ([lifecycle](../../packages/client/resources/README.md#lifecycle)).

## Persistence

The official document key is `dsh-sidebar-workbench:v1:<sessionId>`. The codec stores both layouts, floats, shared minted count, bottom height and first-open marker, per-tab payloads and pins, and namespaced JSON. History resets at process start. Unknown or malformed official versions remain untouched and block automatic overwrite.

When the official key is absent, the adapter may convert `dsh-sidebar:v1:<sessionId>`. It remints ids across right, bottom, and floats; preserves unknown kinds and JSON metadata; converts supported pins; and carries selected Better tombstone/counter data under a namespaced JSON key. It writes the official document before selecting it and never removes or rewrites the legacy key. A failed write selects fresh state for the current process and leaves rollback data intact.

## Workspace Files

The Host `ctx.workspaceFiles` service and generated `workspaceFiles` Remote namespace read files allowed by the Session filesystem backend: `stat(path)` returns `{ absolutePath, version, bytes? }`; `read(path, { offset?, limit? })` returns one page of lines (`offset` 1-based, `limit` capped by the configured page size) as `{ …stat, offset, text, eof }`; `readBytes(path, { offset?, length? })` returns one raw byte window (`offset` 0-based, `length` capped by the configured byte limit) as base64 `{ …stat, offset, data, eof }` with no text decoding. `list(path)` remains inside the workspace root and returns a directory's direct children (`name`, `type: 'file' | 'directory' | 'other'`, `size?`) cut to the configured cap with `truncated` set. `changes()` likewise remains workspace-scoped and yields `{ kind: 'ready' }` once subscribed, then `{ kind: 'change', change }` frames whose payload is `{ absolutePath, version }` or `{ absolutePath, absent: true }` ([README](../../packages/api/workspace-files/README.md#use-this-package)). File operations reject final symlinks and enforce transfer caps; `read` additionally requires UTF-8 text. Failures use `workspace-file/*` codes ([failures](../../packages/api/workspace-files/README.md)).

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.md) registers the `file` provider, with `ResourceProtocolMap.file` directly naming `WorkspaceFileStat`. A Session address carries the authorizing Session and a relative or absolute path, passed unchanged to the Host for resolution. The provider waits for Host `ready` before stat and filters changes by `stat.absolutePath`. Bare `absolute` addresses have no authorizing Session and fail with `workspace-file/unknown-workspace`, without borrowing current or Tab Session. Any UI, including Global components, shares the observation for the same complete address. Preview's ordinary Remote callbacks use the Session in that address; Host `readAll` and `readRelated` remain, and Preview's `rpc.ts` decodes byte results.

## Shipped types

- **`guide`** — `builtin`, opened as `openTab('guide')`. A centred title, one line, and one entry box per `guide` entry the registered types contributed, in `order`; picking a box opens the contributing type as a page in the guide tab's place. A pane holds at most one guide tab, and the strip's add control appears only while its pane has none. A new pane receives the registered default page: the sole guide entry directly, or the guide when the entry count is not one ([guide](../../packages/client/ui-sidebar-right/README.md#ownership-and-presentation)).
- **`text`** — `fallback`, `dsh-resource://file/**`, claiming Session addresses only. Document Preview observes metadata through `useResource<'file'>`, loads content through Remote callbacks, and owns renderer selection, the toolbar, per-tab refresh, scroll, and source navigation; unknown extensions render as plain text ([README](../../packages/client/ui-sidebar-documentpreview/README.md)).
- **`files`** — `builtin`, opened as `openTab('files')`. The workspace directory tree, listed lazily through `list`, opening a file with `tab.actions.openResource(fileAddressFor(sessionId, root, path))` into its own pane ([README](../../packages/client/ui-sidebar-files/README.md)).

## Current limits

- The official document is browser-local best-effort persistence and has no user-facing import/export command.
- The bottom surface shares the right surface's copy and has no independent copy customization.
- Close failures are returned to callers; a shared user-facing error presentation is not yet registered.
- A capability-discovery array (`features`) on the service.
- An `option` priority band for tab types: nothing lists a tab type without letting it claim.
- Retitling a record: `title(address)` is captured once; a live chip comes from the title slot, not from the record.
- Naming a tab implementation when opening: `openResource` names a kind at most; document-renderer selection belongs to the file tab's toolbar.
- An address lookup on the service (`find`): a caller opens with `revealIfOpened` and lets the surface de-duplicate.
- Navigation addresses beyond the Sidebar's own `sidebar://<kind>` bookkeeping; their grammar waits for the navigation controller as a whole.
- A user-facing undo and a content navigation stack ([deferred](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md#deferred)).
