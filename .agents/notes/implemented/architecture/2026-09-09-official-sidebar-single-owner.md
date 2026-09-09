# Agent Note: Official Sidebar is the single workbench owner

Status: implemented

English | [中文](2026-09-09-official-sidebar-single-owner.zh.md)

## Problem

The Web client mounted the official Session workbench and a second Better Sidebar React root. The second root retained its own tab registry, layout store, persistence keys, link and file handlers, and global layout pressure after the official workbench had gained the corresponding capability contracts.

## Decision

The Better Client entry now registers Files and viewers, Changes, Tasks, Side Chat, Terminal, Browser fallback, settings, produced-file and system-path routing, and the Host `sidebar_open` feed through the official Sidebar services and keyed Slots. Browser Workspace and Phone register higher-priority or independent official definitions from their owning packages. The entry no longer creates a React root, provides `ctx.betterSidebar`, constructs the Better layout store or registry, imports the Better layout stylesheet, or installs the older open handlers.

The Desktop settings overlay registers definitions, viewer inventory, custom settings seats, locale data, and the IME and settings-icon adapters. It does not subscribe to Side Chat, Terminal, Changes/Tasks automation, Browser link interception, or Host open delivery. Browser Workspace likewise publishes its overlay face without reconciling Runtime pages. These rules keep one active Session workbench and one external-owner subscription set while preserving the overlay settings inventory.

The official workbench also owns the Dock add action. Web opens the guide; Desktop projects the observable official page definitions into the existing native overlay protocol and opens the selected kind in the originating pane. The guide and native menu derive their visible page roster, order, title, icon, availability, and unavailable explanation from the same definitions. DockKit supplies the pressed control only as an optional menu anchor.

The Better Host routes remain because official file, Git, PTY, jobs, Side Chat, Browser fallback, and model-open consumers still use their bounded transports. Removing the duplicate Client owner does not change those provider trust, Session, workspace-fence, or teardown rules. The existing Better layout keys remain untouched for rollback.

## Alternatives considered

Keeping the Dock add menu in the main renderer would let an Electron Browser `WebContentsView` paint above its rows. Hardcoding a separate Desktop type list would create a second inventory. The native overlay therefore receives the observable official registry, while renderer menus with React Slot actions temporarily conceal the native page and restore it after dismissal.

## Consequences

The official right and bottom surfaces now own placement, persistence, focus, close admission, definitions, viewer matching, and settings. Inactive-Session file, folder, URL, Phone, Browser, and runtime opens use Session-bound official navigation. The plugin catalog names `ctx.sidebarRightTabs` as the extension service.

Focused typechecks and the Better client bundle prove the new entry compiles and excludes the Better service/store/root constructors. Feature tests cover the individual official definitions, bodies, runtimes, routing, settings, and Member Question projection. Commit-identical Web and Desktop product acceptance remains a separate gate.

## Related decisions

This implements the ownership change proposed in [official Sidebar capability fusion](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md). The retained capability details remain in the feature-specific Agent Notes linked there.
