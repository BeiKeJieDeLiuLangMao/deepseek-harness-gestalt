# Agent Note: Better file host on the official Sidebar

Status: implemented

English | [中文](2026-09-09-official-sidebar-better-file-host.zh.md)

## Problem

The official Sidebar could route file resources only to its bounded text preview, while Better Sidebar owned the product's rich editor, six file viewers, path input, and tree operations inside a second workbench. Moving file opens to the official owner without those capabilities would remove editing, media and HTML previews, binary handling, tree mutations, open-with actions, and editor state during layout remounts.

## Decision

Better Sidebar registers one builtin official tab definition with kind `file`, id `@deepseek-ai/dsh-client-ui-better-sidebar/file`, and pattern `dsh-resource://file/**`. The keyed `sidebar.right.pane.tab` body resolves each address against the tab's home Session and uses only official tab information, occurrence signals, navigation, payload, replace, and split actions. It embeds the existing path input and tree with search, reveal, rename, delete, upload, open-with, conversation-reference, and workspace-fence behavior. Plain conversation-reference text enters through the addressed Session's input facade, so its Lexical transaction replaces the live selection without a sidebar DOM query. The `editorExplorer` preference selects merged replacement or separate file occurrences.

The package also registers renderer-independent image, PDF, Markdown, HTML, code, and binary-download definitions through `ctx.sidebarRightTabs.registerViewer`. Components remain keyed `sidebar.right.file.viewer` contributions. Media viewers use bounded Host routes, text viewers use the fenced `fs.read` route, and a binary text-read result is rematched with head bytes before the code fallback. HTML content loads from the Host route in an opaque-origin sandbox by default. Official preferences own viewer enablement, HTML safety, open-with settings, editor layout, and the workspace fence.

An `OfficialFileRuntime` retains dirty content, editor mode, HTML occurrence unlock, and preview/editor scroll by home Session and tab id. React body remounts do not release this state. The official occurrence signal releases it when the record disappears, and close admission asks before discarding a dirty draft. File rename and delete reconcile every affected official occurrence through the Session-bound navigator.

System path interception, produced-file turn tails, and the Host `sidebar_open` delivery feed open resources through the initiating Session's official navigator. Folder and produced-file reveal requests carry absolute paths in file navigation parameters; the occurrence consumes each navigation revision once and expands every ancestor between its tree root and the requested files. URL requests delegate to the official Browser owner.

This implements the Files and viewers portion of the [official Sidebar capability fusion](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md). That proposal remains active for the other workbench capabilities and final removal of the snapshot layout owner.

## Alternatives considered

**Keep file navigation in `ctx.betterSidebar`.** Rejected because Member Question, chat links, and official Files would continue to address a second workbench and preserve two file registries.

**Put viewer components in the official registry definitions.** Rejected because definitions must remain renderer-independent and survive component HMR; keyed Slots own React bodies and their stores.

**Use the official bounded text preview for every file.** Rejected because it cannot preserve Better's editing, media, HTML safety controls, binary detection, or tree operations.

## Consequences

Official resource opens retain the Better file experience while the official workbench owns identity, placement, navigation, preference state, and close admission. A file occurrence can remount or move without losing a dirty draft, and binary data does not enter the code editor after head-byte detection.

The keyless assembled Member Question path covers Markdown reading, sandboxed HTML rendering, receiver-owned paths, viewer availability, and fold/reveal behavior. Definition tests cover all six registrations and binary rematching; runtime tests cover retained dirty state and close admission; open-routing tests cover inactive-Session targeting, folder payloads, tree reveal parameters, Host request validation, and URL delegation. A focused input-shell test proves conversation text replaces the addressed Lexical selection. Image, PDF, code editing, binary download, tree mutations, split placement, open-with, save shortcuts, and layout-remount retention remain outside that assembled scenario. Existing Better component tests exercise the shared viewer, editor, and tree implementations, but they do not establish official-occurrence acceptance for those paths.
