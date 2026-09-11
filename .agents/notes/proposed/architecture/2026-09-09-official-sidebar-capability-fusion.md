# Agent Note: Unify Sidebar capabilities on the official workbench

Status: proposed

English | [中文](2026-09-09-official-sidebar-capability-fusion.zh.md)

## Problem

The Web composition mounts one official right-side workbench. `ui-sidebar-right` owns the frame's `rightbar` seat, a DockKit surface, `ctx.sidebarRight`, `ctx.sidebarRightTabs`, and the guide, Files, and text-preview types. `ui-better-sidebar` registers those remaining capabilities onto that official surface and no longer mounts a direct React root; Host `/sidebar` routes and snapshot tab types remain until each capability has a formal provider. File, Browser, Phone, Side Chat, Terminal, Changes, Tasks, Member Question, and model-initiated opens still need one state owner for every leftover snapshot type.

The official workbench supplies the stronger composition model: a tab definition, keyed body/title/menu slots, typed resource addresses, per-record occurrences, pure DockKit operations, two persisted surfaces, stable multi-instance identities, transactional close, inactive-Session opens, and a read projection. It does not yet express every behavior that the other workbench carries. Removing the second UI before those gaps close would lose descriptor metadata, cross-Session terminal pins, rich viewers, runtime tabs, settings, and third-party extensions.

## Proposal

Make `@deepseek-ai/dsh-client-ui-sidebar-right` the only visible workbench and layout-state owner. Extend its public definition, navigation, occurrence, and persistence contracts, then register the existing capabilities through its slots. Keep `@deepseek-ai/dsh-client-ui-dockkit` as the only layout engine. Delete the Better direct root, layout store, layout CSS pushes, and `ctx.betterSidebar` after every consumer uses the official interfaces.

Host routes can remain while their capabilities move to formal provider/consumer ownership. This proposal does not require replacing a working Host file, Git, PTY, jobs, Side Chat, Phone, or Browser transport merely to rename it. Every retained route keeps its Session owner, browser trust, workspace fence, bounded-I/O, and teardown rules, and exactly one provider owns each capability.

## Delivered foundation

The official package now owns the right and bottom surfaces, floats, versioned Session persistence, Better-state conversion, targeted navigation, close coordination, occurrence signals, projection, and global preference document. Its tab definition includes inventory metadata, availability, creation, deduplication, `onOpen`/`onActivate`, badge, URL claim, settings, and true-close hooks. The same registry owns renderer-independent viewer definitions; keyed slots carry bodies, titles, custom icons, custom settings, guide replacement, and menu actions. `activate: false` restores a cold occurrence without changing focus or expansion. Cross-Session pins render as ephemeral views over the home occurrence, so update and close still target one authoritative record and runtime owner.

The retained `dsh-better-sidebar` settings namespace has one browser controller and one 30-field snapshot. The official frame consumes its initial-open, width, title-bar, HTML safety, Browser safety, Terminal, filesystem, enablement, and plugin settings. The legacy dragged-width key is read without mutation, while settings writes use path operations that preserve sibling descriptor entries.

## Ownership and lifecycle

The official Session workbench owns right and bottom DockKit layouts, floating panes, placement, focus, tab records, occurrence state, persistence, and close admission. A tab type owns its body store, data loading, and runtime manager through the keyed Slot registration. A tab body may mount and unmount many times while one occurrence remains alive.

An occurrence signal ends when the tab record disappears or `ui-sidebar-right` unloads. Hiding a tab, switching Session, splitting, dragging, floating, fullscreen changes, and renderer remounts do not end it. A tab-type HMR unload also does not end the occurrence: the record and persisted payload remain, the official unavailable body appears, and re-registering the same definition restores the body. The type registration disposer releases or pauses the type's runtime manager without running user-close behavior. Only a true user or owner close may archive a Side Chat, kill a PTY, close a Browser Workspace page, or stop a Phone task, and that close completes its asynchronous admission before the layout commit. An external-owner open or close establishes a history checkpoint and cannot be undone or redone; ordinary resource layout history remains reversible.

## Required official interfaces

| Contract | Required behavior |
|---|---|
| Persistent workbench state | A versioned codec and adapter load and save the right surface, bottom surface, floats, history policy, identities, payloads, pins, Side Chat tombstones, width, and bottom height. The adapter belongs to `ui-sidebar-right`; no mirror store remains. |
| Bottom surface | `ui-layout` supplies a bottom seat and center-column track. `ui-sidebar-right` owns a second DockKit surface in the same Session workbench state and shares one id/occurrence domain across right, bottom, and floats. |
| Page identity and payload | Page opens accept a stable caller-supplied identity. A declaration-merged, JSON-compatible payload is persisted per occurrence and can be updated with the title. Unknown kinds and payloads remain recoverable. |
| Targeted navigation | A public Session-bound navigator opens resources and pages in an inactive or not-yet-rendered Session. It materializes official state instead of relying on a mounted seat or a concrete internal method. |
| Close admission | Every operation that can remove a record, including replace, settle, reset, undo, and redo, enters one close coordinator. A batch completes every cancellable admission before state changes. Runtime releases then settle per record: successful records close, failed records remain with visible failure, and already committed external work is never presented as rolled back. HMR disposal does not call the close hook. |
| Read projection | A stable official projection and subscription expose only product facts needed for visible-file folding, Browser reconciliation, pin inventory, settings, and migration. DockKit nodes and operations remain internal. |
| Extension definition | The official definition expresses order, hidden state, availability, icon/title/badge, single or keyed instances, URL claims, enabled state, settings declarations, lifecycle callbacks, and a keyed body/title/menu registration owned by one effect. |
| Viewer registry | The official file-viewer inventory preserves priority and registration order, extension matching, head-byte detection, catch-all fallback, abortable custom loads, enablement, settings, and HMR disposal. Asynchronous sniffing stays behind one official file occurrence. |
| Link routing | Chat and Markdown link actions consult the official URL-claim registry. One handler applies master and protocol settings and preserves modified-click bypass; no Better document-capture owner remains. |

## Capability baseline

| Capability | Behavior that must survive | Current evidence and migration risk |
|---|---|---|
| Official right presentation | Collapsed rail, push mode, wide fullscreen with retained track, automatic narrow fullscreen, frame-owned resize, at most two horizontal panes, guide reseeding, undo/redo, and official floats. | `apps/web/tests/sidebar-right.e2e.ts` and `ui-sidebar-right` specs cover these paths. A second root or stale global margin produces duplicate UI or double layout pressure. |
| Bottom workbench | Independent tabs and split tree, resizable height, per-Session open state, first-open Terminal option, and type-only opens in the last touched bottom pane; content opens land in the visible right workbench. | Official `ui-sidebar-right` owns the bottom seat. The unused Better direct root is already deleted; remaining snapshot types still need official bodies. |
| Persistence and recovery | Session-isolated topology, global dragged width, bottom state, float geometry/z order, tab payloads, pins, tombstones, narrow-load collapse, malformed-state fallback, and `?dsh-sidebar-reset`. | The migration writes a new official key atomically and keeps every `dsh-sidebar:v1:*` key unchanged for rollback. Duplicate ids, partial writes, or silent fallback can destroy a layout. |
| Third-party tabs | Stable definition id/kind, ordered add entry, availability, icon, badge, create/dedupe, URL target, persistent JSON payload, settings, open/activate/async-close hooks, unavailable fallback, and HMR recovery. | Current Better tests cover selected lifecycle and Phone registration paths; official registry tests cover takeover and unavailable fallback. Unknown synthetic kinds and payloads must round-trip. |
| Files and open paths | Keep the official guide, Files tree, `dsh-resource://file` Session/absolute ownership, bounded paging, one-based line navigation, resource dedupe/revision, Better path input/tree/search/reveal, write/rename/delete/upload/open-with, and merged/separate editor modes. | `ui-chat` already calls `ctx.sidebarRight.openResource(fileAddress, { params: { line } })`. Member references, folder reveal, model opens, and any legacy OS-open funnel must converge without bypassing owner or fence checks. |
| File viewers | Image, PDF, Markdown, sandboxed HTML, code, and binary-download viewers retain their matching and safety behavior. Markdown keeps CodeMirror editing, Mod-S, history, scroll handoff, frontmatter hiding, local images, sanitized raw HTML, Mermaid, ToC, and selection-to-composer. | The retained tree lacks complete assembled coverage for all six viewers. Binary head sniffing must run before the code catch-all; HTML remains sandboxed by default. |
| Unsaved editor state | Dirty marker, save state, Mod-S, and confirmation before refreshing a disk-changed file remain. A dirty draft survives layout-only body remounts and is observable before a candidate switch. | Current source has no tab-close or page-reload guard. A close guard added here is new behavior and must be described and tested as such. |
| Changes | One `git` page retains two lenses: Git repository truth and Session read/write/edit/error/running history. It keeps worktree selection, stage/unstage, commit, branch, history, destructive confirmations, polling, badges, redaction, inline preview, fold loading, and float/docked expanded diffs. | `git-selection` and persistence-read tests cover only parts of the behavior. Replacing either lens with the other is silent feature loss; ephemeral diffs must not revive stale content on restore. |
| Tasks | Subagent lineage and live lines, child navigation that leaves Tasks open, and main/descendant jobs with model-read output replay, visibility-gated polling, and two-click kill remain. | `sidebar-subagent-activity.e2e.ts` covers live descendant ownership. Side Chats must stay out of the topology, and remount must release observations without stopping jobs. |
| Side Chat | Provisional identity, first-prompt publication, parent-context inheritance, independent model selection, prompt/cancel/queue/permission, cold restore, descendant navigation, archive-on-close, and local close tombstones remain. | The Side Chat unit suites and `sidechat-round.e2e.ts` cover the complete Host path. Official undo must not resurrect an archived owner, and async close must target the original Session after a switch. |
| UI Terminal | Multi-instance limit, effective shell title, xterm replay/input/resize, live theme/font, URL activation, reconnect, dependency diagnostics, park on Session switch, and close-frame plus HTTP fallback remain. | A body remount causes a bare reconnect. It must never be interpreted as a close; quota counts tabs across right, bottom, floats, and pinned projections. |
| Model terminals and pins | The opt-in create/list/send/read/wait-for/resize/signal/close tools, live tab feed, workspace/global pin scopes, and home-Session close/unpin behavior remain. | Tool ownership and UI occurrence lifetime differ. A pinned tab is a reference to one home owner, never a copied PTY owner. |
| Browser | Multi-instance Browser Workspace pages retain Profile/target identity, URL seeds, one-to-one reconciliation, Session restart recovery, stale-close retry, reveal, and link/model-open creation. Compositions without Browser Workspace retain the iframe browser, back/forward/reload, probe/external fallback, safe default sandbox, temporary unlock, and loopback allowlist. | `ui-workbench` specs and `browser-dock.e2e.ts` cover the product adapter. Dropped payloads lose targets; two close owners can duplicate or reopen pages. The fallback's security settings cannot be removed as a substitute for preserving it. |
| Phone | One singleton Phone page keeps picker/device switching in place, persisted device id/name, fleet badge, hidden playback pause, reconnect/remint rules, control input, and the independent Phone settings gate. | Phone has extensive unit and Desktop/device acceptance. Losing payload returns an occupied tab to the picker; renderer remount must not stop the Host task. |
| Member Question | A material chip opens the receiver-owned cached copy, folds the card only while that file is visible, and restores the card from the participant strip without reading a same-named Workspace file. | `member-question-receiving.e2e.ts` covers the assembled path. The official projection must distinguish active docked, open bottom, and visible float occurrences. |
| Model `sidebar_open` | The tool is absent by default. When enabled, file, folder, and HTTP(S) targets open in the calling Session; inactive Sessions queue and consume each accepted request once. | `agent-opens.client.spec.ts` and headless snapshots cover queue/tool behavior. Delivery must use the official targeted navigator and honor disabled types before acknowledging. |
| Settings and shell | One settings document drives all tab/viewer enablement, plugin blobs, open defaults, layout defaults, auto-open, tool gates, editor/Changes choices, filesystem fence, terminal, HTML/Browser safety, link routing, and shell/titlebar compatibility. | Revision-guarded writes and legacy titlebar conversion remain. Every visible row must change official behavior; no fake switch or second settings state remains. |
| Host providers | File/Git/media/HTML/upload, PTY, jobs, subagent, Side Chat, settings, Browser probe, external-open, and agent-open transports keep their trust and ownership rules while official consumers replace Better UI consumers. | UI ownership does not justify a transport rewrite. A retained private route must have one formal capability owner and cannot be deleted until its last migrated consumer has an equivalent. |

## Lifecycle acceptance cases

| Case | Required observation |
|---|---|
| Cross-surface runtime | A Terminal moved right → bottom → float → right, hidden, switched across Sessions, and remounted keeps one runtime and transcript; explicit close releases it once. |
| Deferred close | A Side Chat close pending in Session A cannot target B after a switch. Duplicate closes join it; veto changes no layout; retry archives A once and then removes its record. |
| All removal paths | Close, replace, pane settle, reset, undo, and redo use the same coordinator. Dirty cancellation preserves content and topology. Batch admission changes nothing until all cancellable checks pass; later release failure retains and reports only failed records. |
| Runtime history | Closing a published Side Chat cannot be undone into an archived child or redone into a second archive. Ordinary file layout undo still works after the checkpoint. |
| HMR and unknown payload | Removing a third-party definition shows unavailable without closing or losing nested JSON, then the same id re-registers without duplicate owner creation. |
| Cross-Session pin | Workspace/global virtual views reference one home Terminal. Unpin closes no PTY; close from another Session targets home once; missing home is visibly recoverable. |
| Duplicate content | `revealIfOpened: false` may create two file occurrences. Runtime identities dedupe or explicitly share ownership, and one view close never releases a remaining owner. |
| Never-rendered Session | Two `sidebar_open` requests target a Session before its first render, arrive once after attach, keep their lines/targets, and do not reroute during a Session switch. |
| Legacy conversion | A fixture with right/bottom splits, floats, unknown metadata, pins, tombstones, and duplicate ids converts to unique official occurrences and does not convert twice. |
| Storage failure | A failed official write selects no partial state and changes no legacy byte. Retry succeeds; corrupt new state remains recoverable; reset and rollback have separate scopes. |
| Diff and Browser restore | An ephemeral diff follows its restore policy; Browser target/Profile rebinds without duplication and a failed target close remains retryable. |
| Member cached resource | Card folding follows the visible receiver-owned cached resource across right, bottom, float, hide, tab change, and line navigation, never a Workspace twin. |

## Settings migration

The current settings document is `dsh-better-sidebar`. The implementation may keep that durable name or migrate it once to an official namespace, but it must expose one live document and preserve every explicit stored value. The Browser Workspace product patch continues to force its documented Browser settings.

| Existing field and default | Official behavior |
|---|---|
| `openByDefault=false` | Seeds new wide Sessions expanded; new narrow Sessions stay collapsed; migrated Session visibility wins. |
| `defaultWidthPercent=35` | Seeds the official frame width before the first open; a migrated global dragged width wins. |
| `autoOpenSubagent=true` | Focuses Tasks for a new descendant; wide opens, narrow prepares without covering the conversation. |
| `autoOpenJobs=true` | Applies the same rule for every newly observed job id. |
| `agentTerminalTools=false` | Gates the model terminal tool registration and official live-tab feed. |
| `agentOpenTools=false` | Gates `sidebar_open`; delivery targets official resources and pages. |
| `terminalFontFamily=''`, `terminalFontSize=13` | Applies live to official Terminal bodies without restarting the PTY; size clamps to 9–32. |
| `bottomPanelAutoTerminal=true` | The first bottom expansion per Session attempts one Terminal, subject to enablement and quota. |
| `interceptOpenPath=true` | Selects official in-product file opening; false uses the Host OS opener. Turn-tail deliverables use the same choice and never double-open. |
| `editorExplorer=false` | Keeps separate file tabs by default; true uses the merged path/tree editor header. |
| `changesDiffFloat=true` | Opens expanded Git diffs as official floats; false opens in a docked pane. |
| `workspaceFence=true` | Keeps symlink-aware confinement for file mutations, media, HTML, and upload; explicit false keeps the warned global-path behavior. |
| `terminalShell=''`, `terminalShellArgs=''` | Overrides boot-time shell defaults for terminals opened after the setting changes. |
| `titleBarScheme='auto'`, `titleBarPresetId=''` | The official frame implements auto, web, preset, and custom placement; an unknown preset fails visibly or returns to an explicit safe value. |
| `customCss=''` | One official root style owner applies it only in custom mode and removes it on mode change or HMR. |
| `titleBarCompat=false`, `titleBarStripPx=40` | Legacy true converts to custom when no scheme exists; the custom inset clamps to 0–120 and affects only the official shell. No second legacy switch is shown. |
| `htmlViewerNoSandbox=false`, `htmlViewerDefaultUnsafe=false` | Keeps the safe global default and per-new-occurrence unsafe seed, with warnings and per-occurrence restore. |
| `browserNoSandbox=false` | Controls the supported iframe Browser fallback and retains its unsafe warning. |
| `browserInterceptLinks=true`, `browserInterceptHttp=true`, `browserInterceptHttps=false` | Gates the single official link-routing action by master and protocol; modified clicks bypass it. |
| `browserAllowedLoopback=''` | Blocks loopback in the iframe fallback unless a host or host:port is listed; the GUI origin stays separately controlled. |
| `tabsEnabled={}` | Missing means enabled; false hides new opens and derived actions while an existing record stays renderable. Unknown ids survive. |
| `viewersEnabled={}` | Missing means enabled; false skips the viewer and continues matching. Unknown ids survive. |
| `pluginSettings={}` | JSON blobs remain keyed by stable official definition/viewer id and survive HMR and migration. |

Host configuration keeps `readLimit`, `mediaLimit`, `uploadLimit`, `listLimit`, `terminalsPerSession`, `reconnectGraceMs`, `shell`, and `shellArgs`. The implementation chooses one source for the Terminal limit instead of keeping the configured Host limit and a contradictory client constant.

## Existing non-capabilities

There is no current general layout import/export command. The plugin catalog copies install commands; it does not import a layout. The one-time migration adds versioned backup and conversion, not a user-facing feature that did not exist.

Official topology and occurrence metadata use versioned browser-local persistence, while frame geometry and reversible history remain process-local. Remaining migrations must preserve that distinction and extend the codec when a runtime owner needs additional recovery data.

## Delivery sequence

1. Land one foundation change that owns the official state codec, legacy conversion, page identity/payload, targeted Session navigator, close admission, read projection, and extension lifecycle interface.
2. Add the official bottom seat, center-column track, second DockKit surface, and one official chrome owner.
3. Migrate Files, six viewers, open-path settings, Member Question, and `sidebar_open` file/folder delivery; retain official `dsh-resource` and line navigation.
4. Migrate Changes and Tasks without combining their distinct data meanings.
5. Migrate Side Chat, Terminal/tools/pins, Browser/fallback/link routing, and Phone through occurrence-owned runtime lifetimes.
6. Remove the Better root, store, registry, layout persistence, global layout CSS, and every `ctx.betterSidebar` consumer. Keep only Host providers still consumed through a formal capability.
7. Run unit contracts, invalid migration fixtures, keyless assembled snapshots, Browser E2E, and a commit-identical Desktop candidate. Switch the existing userData only after no draft/running prompt, dirty editor, active Terminal, active Phone task, or unresolved Browser work can be lost.

## Related decisions

The shipped [right Sidebar docking infrastructure](../../implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md) remains the authority for DockKit geometry and presentation, and [Sidebar tab types and navigation](../../implemented/architecture/2026-09-05-sidebar-tab-types-and-navigation.md) remains the authority for resource routing and keyed bodies. The [Better Sidebar source refresh](../../implemented/feature/2026-09-06-better-sidebar-0-18-source-refresh.md) remains the capability baseline until each behavior migrates. The [Member Question files decision](../../implemented/architecture/2026-09-03-member-question-files-sidebar.md) retains receiver-owned file identity. This proposal extends those decisions and does not supersede their independent rationale.

## Alternatives considered

Keeping Better as the UI owner and porting the official resource reader into it preserves more code initially, but it discards the official extension model, DockKit history, resource ownership, and the declared future base. Keeping both panels behind a preference leaves two layout and state owners and cannot guarantee which consumer opens which surface.

A compatibility service that mirrors official operations into Better state reduces immediate consumer edits, but it creates two registries and two persistence documents. HMR, close admission, and inactive-Session opens would still race across owners. The migration instead updates each consumer to the official interface and retains unknown records as unavailable official tabs.

Rewriting every Better Host transport before moving the UI increases scope without proving a user-visible property. This proposal retains a working transport until an equivalent formal provider is ready, while forbidding duplicate providers and preserving trust, fence, owner, and cleanup rules.

## Acceptance criteria

- The built Web and Desktop graphs render exactly one official right/bottom workbench owner; source and runtime checks find no Better direct React root, Better layout store, Better global layout push, or second tab/viewer registry.
- Synthetic legacy fixtures convert right, bottom, float, unknown plugin, JSON payload, dirty editor, Browser target/Profile, Phone device, Side Chat, Terminal pin, and tombstone state. The official document is written before selection, and every legacy key remains unchanged for rollback.
- Split, drag, float, fullscreen, Session switch, renderer remount, and tab-type HMR do not archive Side Chat, kill PTY, close Browser Workspace, or stop Phone ownership. A true close runs exactly one admitted cleanup against the original Session.
- The guide, Files tree, bounded text paging, line reveal, six preview types, rich editor, both Changes lenses, Tasks/jobs, Side Chat cold/model paths, Terminal/tool/pin paths, Browser Workspace and iframe fallback, Phone, Member Question, turn-tail, ordinary file open, external link routing, and `sidebar_open` all pass their keyless product paths.
- Every existing settings field has the behavior listed above, one durable value, and a visible row only when it changes supported behavior. Explicit false and unknown plugin keys survive migration.
- The final candidate is built from the exact integration commit. The existing userData is backed up and converted in place only after the operational gate finds no running prompt, composer draft, dirty editor, active Terminal, active Phone task, or unresolved Browser work.

## Risks

The state foundation spans layout, identity, persistence, and lifecycle. Splitting those contracts across independent implementations can produce a layout that restores records without enough data to resume their owner. The foundation therefore lands as one coherent change before feature migrations branch from it.

Official undo makes layout close reversible, while Side Chat archive, PTY kill, and Browser close are external owner actions. A close that releases an external owner cannot be treated as an ordinary reversible DockKit operation unless reopening has an explicit recovery action.

The Better extension service has third-party consumers outside this repository. Removing it without a source-compatible adapter would break them, but retaining it as a second registry violates the ownership decision. The official extension contract and migration guide must be sufficient for those plugins, and unsupported descriptor fields must fail loudly during the transition.

Unsandboxed HTML and the iframe Browser fallback can access sensitive GUI state. Settings migration, defaulting, and per-occurrence unsafe state require explicit invalid and default fixtures; a missing value must remain safe.

The final in-place conversion touches userData that also holds long-lived runtime work. A successful synthetic conversion does not authorize interrupting live work. The operational gate and rollback backup remain required even after all code tests pass.

Desktop must establish a stable GUI origin before an existing profile can rely on browser-local official state. The launch owner persists one chosen loopback port outside Web storage, reuses it on later starts, and fails with a recovery diagnostic when another process occupies it. An explicit configured port wins; otherwise a valid stored port wins; otherwise the owner allocates and persists once. A known legacy origin such as port 53353 is an explicit migration source, never an inferred scan. Migration reads only the named old origin after the stable origin is active, records completion, preserves the old data, and does not copy Session, workspace, Browser, or application state outside the Sidebar keys.
