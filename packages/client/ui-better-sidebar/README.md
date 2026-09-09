---
description: "Pinned DSH-better-sidebar snapshot: right sidebar and bottom-panel workbench host and client halves."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-better-sidebar

English | [中文](README.zh.md)

## Summary

Use the pinned Better Sidebar snapshot to supply workbench capabilities. Its Host half serves sidebar data, media, previews, lazy chunks, and terminal WebSockets behind the trust fence; its Client half renders the snapshot panels through `ctx.betterSidebar` and contributes its file host to the official Sidebar. Upstream refresh instructions and repository-owned modifications remain documented separately.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

Pinned source snapshot of [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). The host half mounts `/sidebar` JSON, media, HTML preview, lazy-chunk, and terminal WebSocket routes behind the webServer trust fence. The client half publishes `ctx.betterSidebar` and paints the right sidebar plus bottom panel. Only the public `./client` entry augments Cordis with that Client service; the shared snapshot mirror is named `SidebarContext` so Host type catalogs cannot mistake it for Cordis `Context`. SHA and refresh steps live in [UPSTREAM.md](UPSTREAM.md). Repository-owned edits are listed in [LOCAL-MODIFICATIONS.md](LOCAL-MODIFICATIONS.md).

Product composition mounts this package and [`dsh-client-ui-workbench`](../ui-workbench/README.md). The adapter enables the snapshot browser tab and publishes official chrome from [`dsh-client-ui-browser`](../ui-browser/README.md); the sandboxed iframe remains the standalone fallback. Do not edit snapshot sources to change product behavior.

The Client registers one builtin `file` type for `dsh-resource://file/**` through `ctx.sidebarRightTabs` and supplies its body through the keyed `sidebar.right.pane.tab` Slot. The body resolves Session-scoped paths against the tab's home Session, uses official occurrence actions for replace, new-tab, split, payload, and line navigation, and embeds the Better path input and file tree. The tree retains search, reveal, rename, delete, upload, open-with, conversation reference, workspace-fence, and merged or separate editor behavior. Dirty drafts, editor mode, HTML unlock, and scroll state belong to the official occurrence until its signal aborts; a true close asks before discarding a dirty draft ([decision](../../../.agents/notes/implemented/feature/2026-09-09-official-sidebar-better-file-host.md)).

Six renderer-independent viewer definitions select image, PDF, Markdown, HTML, code, and binary-download bodies. Image and PDF use bounded media routes; text viewers use the fenced file-read route; a binary result is rematched with its head bytes before the code fallback. HTML loads from the Host preview route in an opaque-origin sandbox unless the official warned setting allows an unsafe occurrence. Viewer enablement, HTML safety, open-with data, editor layout, and the workspace fence use the official Sidebar preference owner.

A fresh Session opens the snapshot sidebar on an empty pane whose cards mirror the enabled `+` menu tab types; no tab type receives implicit priority. Selecting Files opens the same `editor` tab type offered by the menu. Member Question material chips open a `fileAddressFor` resource through `ctx.sidebarRight.forSession(sessionId)` with the receiving Session id and a receiver-owned hidden Workspace path; Markdown and sandboxed HTML use the official file host, and a composition without a file type falls through to the Host system opener ([decision](../../../.agents/notes/implemented/architecture/2026-09-03-member-question-files-sidebar.md)). Persisted user-created snapshot tabs remain authoritative, while the exact automatic Files-home record from the older default is removed when its layout loads ([decision](../../../.agents/notes/implemented/bug-fix/2026-08-24-sidebar-opens-on-tab-picker.md)).

Cold Host reads for the Session working directory, the Changes tool-event lens, and Side Chat preset or model recovery use the formal Session Persistence `open(id, 'read')` handle and release it before route-specific work continues. Side Chat folds persisted model state from the exact child-owned suffix identified by `inheritedEventCount`, checks a cold identity with `stat` before retaining a model selection, and uses `list` only to report durable publication during close. The Changes lens maps a missing or unreadable cold log to an empty window; working-directory and Side Chat failures remain explicit API errors ([decision](../../../.agents/notes/implemented/bug-fix/2026-09-08-better-sidebar-session-persistence-read-handles.md)).

The Side Chat tab mounts the repository's declared `conversation` slot under a provisional child Session id. The provisional row carries the reserved `Side: ` title immediately, so list classifiers and subagent auto-activation never classify the draft as a delegated task; its provisional marker also excludes it from parent descendant counts until publication. Opening the tab creates no Host Session or Agent; the first submitted message atomically creates both under that id, captures the parent history, installs the chosen model, and admits the prompt. The registered Chat/Trajectory views, Session actions, transcript, and InputBar therefore share the same components as the main conversation. The tab shell owns only child creation and lifecycle; it has no in-tab thread switch, new-thread, or promotion toolbar. Its admission adapter owns prompt, cancellation, queue/steer, permission, skill-catalog, and model routes so generic Session RPCs never bypass subagent ownership. The adapter carries each prompt's `requestId` through first-contact and later queue/steer admission into the child user source's `rpcId`, so a local submission echo retires when its durable projection appears. The model route inspects the effective Side Chat selection and routability while the shared Host catalog supplies provider groups; a draft inspection addresses the live parent and a published inspection addresses the child. A provisional permission command executes against the live parent's ordinary command route, and the future child inherits that selection on first admission; after publication, the Side Chat route applies each permission change to both parent and child. The Side Chat header omits Session title, breadcrumb navigation, and the agent-preset label while retaining the view tabs, a catalog of this Side Chat's descendants, and child-scoped schedules and background jobs. Selecting a descendant retargets the same Side Chat tab instead of changing the shell's selected Session. An ordinary-header catalog row whose durable title starts with `Side: ` opens or focuses that Side Chat tab on the ordinary owner without changing shell selection; `createTab` reuses an explicit `openTab` seed so restoration and catalog opens share one identity. The tab retains its root child id so closing it still disposes the owning live handle. Header actions follow Trajectory, and task popovers use viewport portals aligned to open left inside narrow sidebars. The Session header marks the captured parent prefix as inherited; the child descriptor is the first owned event, so the durable parent address remains valid while `owned-suffix` hides only the inherited prefix from the child transcript. Workbench terminal tabs remain scoped by their own `SessionScope` and are not retargeted by the embedded conversation.

Side Chat tabs survive a Host restart. A thread is a durable child Session while the tab strip lives in origin-scoped localStorage, so a restart under a new origin can lose the strip without losing the threads. When a Session's sidebar state activates, the strip restores every published, unarchived direct Side Chat child that lacks a tab. A cold child whose Session summary has no title projection uses the matching direct parent catalog label for the reserved `Side: ` classification and tab title. Restored tabs land in the active pane without replacing its active tab; blank children and renderer-only provisional identities do not restore. A restored thread resumes with the model route from its latest child-owned request, or its creation descriptor before any request exists; a provisional draft still reads the live parent's route. The Host serializes close against an admitted first prompt, reports publication from its live and durable Session stores, and releases the live handle. The client archives a published Session without deleting its log; an unsent draft has no Session to archive. The tab closes only when those operations succeed; failure is reported and leaves it open. Plugin disposal waits for in-flight closes without letting them commit stale browser state. A local tombstone then prevents list refreshes from reopening the tab before the archive projection arrives. The `?dsh-sidebar-reset` escape hatch skips restoration for that load.

File-tree rename refuses an existing destination; delete is permanent and protects the workspace root. Changes previews provide reading mode and default secret redaction. Terminal settings accept quoted shell paths and arguments; `terminal_wait_for` searches a JavaScript regular expression and returns the matched text, with literal matching for an invalid pattern.

<a id="model-experience"></a>
## Model Experience

### Side Chat

#### What the model sees

The persisted child Agent receives the parent log captured when the first question is submitted, followed by a plugin-stamped context injection containing the side-conversation boundary and any frozen in-progress parent output. The first question follows that injection in the same admission. Each plugin activation owns its live Side Chat handles: unload closes route admission, waits for admitted calls, and disposes every handle while retaining persisted history.

#### Token effect

The child request includes the inherited parent log, the boundary injection, and the Side Chat question.

#### KV Cache effect

The inherited parent history remains a reusable prefix; the boundary injection and first question diverge after it.

### Optional sidebar open tool

#### What the model sees

When the Side Card setting `agentOpenTools` is on, the snapshot host adds the `sidebar_open` tool schema. The tool accepts one local file, local folder, or HTTP(S) page and targets the calling Session; a request stays queued when that Session's sidebar view is disconnected. The tool remains absent while the setting is off.

#### Token effect

Enabling the setting adds the `sidebar_open` tool schema to later requests.

#### KV Cache effect

There is no effect while `agentOpenTools` is off. Enabling it invalidates a cached request prefix that omitted the tool schema.

### Optional terminal tools

#### What the model sees

When the Side Card setting `agentTerminalTools` is on, the snapshot host adds its optional `terminal_*` tool schemas. The tools stay absent until that setting is enabled.

#### Token effect

Enabling the setting adds the optional tool schemas to later requests.

#### KV Cache effect

There is no effect while `agentTerminalTools` is off. Enabling it invalidates a cached request prefix that omitted the optional tool schemas.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Iframe browser implementation stays in the snapshot** — product composition replaces its rendered chrome through `workbenchBrowser`; a standalone snapshot install still uses the iframe.
- **Host fs/git/pty routes are the snapshot's own stack** — they do not yet consume the repository `fs` or `terminal` capability seams.
- **Right overlay plus official details Dock can both paint** — layout unification is deferred.

No runtime invariant companion is published because its Host effects and Client registries are observed only through their owning services, with no independently published second observation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
