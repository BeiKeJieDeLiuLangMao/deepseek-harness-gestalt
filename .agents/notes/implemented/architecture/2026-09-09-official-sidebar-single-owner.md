# Agent Note: Official Sidebar is the single workbench owner

Status: implemented

English | [中文](2026-09-09-official-sidebar-single-owner.zh.md)

## Problem

The Web client mounted the official Session workbench and a second Better Sidebar React root. The second root retained its own tab registry, layout store, persistence keys, link and file handlers, and global layout pressure after the official workbench had gained the corresponding capability contracts. Its shell also isolated Sidebar file drags from the composer and supplied pane-relative tab actions, so removing that root without assigning those interactions to the official owner exposed the document-level file intake and reduced the tab menu.

## Decision

The Better Client entry now registers Files and viewers, Changes, Tasks, Side Chat, Terminal, Browser fallback, settings, produced-file and system-path routing, and the Host `sidebar_open` feed through the official Sidebar services and keyed Slots. Browser Workspace and Phone register higher-priority or independent official definitions from their owning packages. The entry no longer creates a React root, provides `ctx.betterSidebar`, constructs the Better layout store or registry, imports the Better layout stylesheet, or installs the older open handlers.

The Desktop settings overlay registers definitions, viewer inventory, custom settings seats, locale data, and the IME and settings-icon adapters. It does not subscribe to Side Chat, Terminal, Changes/Tasks automation, Browser link interception, or Host open delivery. Browser Workspace likewise publishes its overlay face without reconciling Runtime pages. These rules keep one active Session workbench and one external-owner subscription set while preserving the overlay settings inventory.

The official workbench also owns the Dock add action. Web opens the guide; Desktop projects the observable official page definitions into the existing native overlay protocol and opens the selected kind in the originating pane. The guide and native menu derive their visible page roster, order, title, icon, availability, and unavailable explanation from the same definitions. DockKit supplies the pressed control only as an optional menu anchor.

The official workbench roots consume external OS file drag enter, over, leave, and drop events during bubbling. Files bodies receive their local drops first; the shield then keeps those events away from the document-level composer attachment intake. DockKit tab movement uses pointer gestures, and other drag types continue to propagate.

The official tab menu adds Move to Free Window for docked right tabs and pane-relative close-other, close-left, and close-right actions. It excludes foreign pinned views from pane batches and omits pane actions on a pinned virtual target. Each close batch enters the Session close coordinator once, so every owner completes admission before any release and successfully released records commit together.

The Better Host routes remain because official file, Git, PTY, jobs, Side Chat, Browser fallback, and model-open consumers still use their bounded transports. Removing the duplicate Client owner does not change those provider trust, Session, workspace-fence, or teardown rules. The existing Better layout keys remain untouched for rollback.

## Alternatives considered

Keeping the Dock add menu in the main renderer would let an Electron Browser `WebContentsView` paint above its rows. Hardcoding a separate Desktop type list would create a second inventory. The native overlay therefore receives the observable official registry, while renderer menus with React Slot actions temporarily conceal the native page and restore it after dismissal.

Letting the document-level composer decide whether a file drop belonged to Sidebar content would couple attachment intake to every current and future tab body. The workbench root owns the region, while bubbling preserves Files-specific upload handling.

Closing sibling records directly through layout actions would bypass tab-type admission and runtime release. Pane menu batches therefore use the same close coordinator as individual, replacement, reset, and history closes.

## Consequences

The official right and bottom surfaces now own placement, persistence, focus, close admission, definitions, viewer matching, and settings. Inactive-Session file, folder, URL, Phone, Browser, and runtime opens use Session-bound official navigation. The plugin catalog names `ctx.sidebarRightTabs` as the extension service.

Focused typechecks and the Better client bundle prove the new entry compiles and excludes the Better service/store/root constructors. Feature tests cover the individual official definitions, bodies, runtimes, routing, settings, Member Question projection, drag event ownership across every presentation, pane-relative menu selection, pinned-view exclusions, and batch close ordering. Commit-identical Web and Desktop product acceptance remains a separate gate.

## Related decisions

This implements the ownership change proposed in [official Sidebar capability fusion](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md). The retained capability details remain in the feature-specific Agent Notes linked there.
