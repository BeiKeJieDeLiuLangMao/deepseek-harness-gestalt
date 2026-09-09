# Agent Note: Side Chat resource and display ownership

Status: implemented

English | [中文](2026-09-10-side-chat-resource-display-ownership.zh.md)

## Problem

Side Chat mounted a layout-level conversation entry inside the workbench, so the embedded child could reproduce the main frame instead of rendering only Conversation content. A blank provisional child also entered the Hero phase and displaced its composer. File actions exposed a second ownership conflict: the child Session owns paths and filesystem authority, while the visible workbench belongs to the parent Session. Routing through only one Session either opened an invisible child workbench or used the wrong working directory and authorization scope. Child creation also added its descriptor to the constructor seed even though the seeded Session requires that seed to equal the inherited prefix.

## Decision

`main.conversation` is the reusable Conversation content entry. `ConversationPresentationOwnerProps` carries compact presentation, descendant navigation, and an optional display-host Session. The shell passes the display host through Session header actions and utilities, the Session body, the selected View, Chat nodes, and Turn tails without changing the rendered Session binding. Compact presentation omits hierarchy and workbench controls because the enclosing occurrence owns navigation and panel chrome. A blank Side Chat remains in the active layout and its composer consumes remaining vertical space before sticking to the bottom.

File routing treats the rendered child as the resource Session and the parent as the display-host Session. Chat file links and produced-file actions build a `dsh-resource://file/session/<resource>/...` address from the child's working directory, then open that address through the parent's `sidebarRight` navigator. The official type's whole-address pattern admits the encoder's URI alphabet, including literal dot path components, before its canonical parser decides the claim. The decoder splits and decodes the raw components without constructing a WHATWG `URL`; relative `.` and `..` segments therefore remain in the resource path instead of changing the Session component. The official file host derives reads, writes, viewer loads, tree operations, references, and conversation insertion from the encoded resource Session. Tab occurrence state, editor retention, and rename or removal reconciliation remain on the parent workbench. Official file definitions reject ownerless absolute addresses.

The Better Sidebar bundle imports the shared Client `INLINE_SAFE` policy. Its browser-safe Workspace path helpers therefore use the same no-runtime-identity rule as official Client bundles instead of a separate allowlist.

Side Chat creation passes only the captured parent prefix as the constructor seed and sets `inheritedEventCount` to that exact length. Setup appends `subagent/descriptor` as the first child-owned event before other Agent setup and before the first prompt is admitted.

## Alternatives considered

**Mount `conversation.session` directly.** Rejected because it bypasses the Conversation shell that owns phase selection, the composer, header composition, and the selected View.

**Rewrite child file addresses to the parent Session.** Rejected because the parent working directory and filesystem authority do not identify the child's resource. The workbench navigator chooses where a tab appears; the address chooses which Session authorizes and resolves it.

**Include the descriptor in the constructor seed and increase the inherited count.** Rejected because the descriptor is child-owned and would either violate the seeded-session prefix invariant or incorrectly classify it as inherited history.

## Consequences

Side Chat reuses the complete Conversation content tree without nesting application chrome or exposing child workbench controls, and an empty draft keeps its composer at the bottom. Main conversations omit the optional display-host value and retain their existing routing. Side Chat file links, line navigation, produced-file chips, folder reveals, editor writes, and “Add to conversation” gestures act on child resources while displaying tabs in the parent's visible workbench. Every official file address retains the resource Session separately from paths outside the working directory and relative dot segments. Child logs retain an exact inherited prefix followed by a child-owned descriptor.

## Testing

Focused Client tests cover content-slot mounting, header and View display-host forwarding, blank Side Chat phase, constructor seed length, descriptor append ordering, official registry claims for dot paths, child-address and parent-navigator routing, line parameters, produced-file and folder gestures, editor read/write/insertion ownership, delayed editor navigation cancellation, and unchanged main-conversation routing. The Better Sidebar bundle and complete Client build exercise the shared Workspace path helper under the Client purity policy. The assembled Web E2E opens a child-owned `dir/../child-owned.md` address at line 80 in the parent's workbench, verifies that the marker is visible inside the scrolled CodeMirror viewport, and inserts that selection into only the child draft.
