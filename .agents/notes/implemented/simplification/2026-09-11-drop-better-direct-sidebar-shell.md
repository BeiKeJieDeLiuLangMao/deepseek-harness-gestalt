# Agent Note: Drop the unused Better direct Sidebar shell

Status: implemented

English | [中文](2026-09-11-drop-better-direct-sidebar-shell.zh.md)

## Problem

The official Web and Desktop graphs already register Better capabilities on `ui-sidebar-right`. `packages/client/ui-better-sidebar/src/client/index.ts` only calls `registerOfficialFiles`, official runtime/Changes/Browser/open-routing/settings adapters, and locale/IME/Side Chat admission. It never mounts `Sidebar.tsx` onto `document.body`. The unused shell still shipped a second workbench (`data-dsh-panel-host`), layout-push CSS, split-pane TabBar, and free-window layer, plus tests and e2e selectors that pinned that second UI.

Production `rg` finds no import of `./Sidebar`, `../Sidebar`, or `client/Sidebar`. `layout-push.ts` is imported only by `Sidebar.tsx`. `src/client/sidebar/*` is imported only by `Sidebar.tsx`. `split-pane.tsx`, `TabBar.tsx`, `FreeWindow.tsx`, `OrphanedTab.tsx`, and `tab-content-memo.ts` form the same unmounted cluster. `registerBuiltins` in `src/client/builtins/index.ts` has no production caller. `layout.css` has no import. `apps/web/tests/browser-dock.e2e.ts` still clicked `[data-dsh-better-sidebar]` Close.

## Decision

Delete the unmounted Better shell and the tests that exist only to pin it. Keep Host `/sidebar` routes, official Sidebar registrations, `state.ts` types used by official file/runtime/Changes/Side Chat bodies, `FileTree`/`EditorHost`/`SideChatView`/`sidebar.module.css` consumed by those bodies, and the published `cordis.patch.yml` plugin-install channel. Move File-tree submenu-flip CSS from the unused `layout.css` into `sidebar.module.css`. Point the Browser dock stale-close e2e at the official DockKit tab-close control (`[data-dockkit-tab-close]`), whose English label is still `Close`.

This ships the "delete the Better direct root" half of [Unify Sidebar capabilities on the official workbench](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.md) without deleting `ctx.betterSidebar` types or the remaining snapshot tab registry that official bodies still import as types.

## Alternatives considered

**Delete the entire `ui-better-sidebar` package.** Rejected because Host file/Git/PTY/Side Chat/jobs routes and official tab bodies still live there; removing the package would drop product capabilities, not dead UI.

**Keep the shell for the published `dsh plugin add dsh-better-sidebar` channel.** Rejected for the in-repo Web/Desktop graph: that channel's client factory is the same `src/client/index.ts`, which no longer mounts the shell. A third-party install that expected a second React root already does not get one.

**Leave the unused files as an upstream snapshot.** Rejected because they contradict the official-owner decision, keep stale e2e selectors alive, and cost review and HMR surface for a UI that never mounts.

## Consequences

The built client no longer contains an unmounted second workbench component. Official Browser close still uses DockKit's labeled Close control. Tests that closed the last Better-store tab (`open-tab-landing.client.spec.ts`) and measured Better layout-push/TabBar overlay chrome are gone with that store UI; official close/collapse remains owned by `ui-sidebar-right`. Snapshot sources such as `FileTree.tsx` and `state.ts` remain because official bodies still import them.
