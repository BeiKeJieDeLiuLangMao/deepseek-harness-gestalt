# Agent Note: Client catalog reachability, restated toolSearch, and generated Remote types

Status: implemented

English | [中文](2026-09-11-ci-catalog-toolsearch-pins.zh.md)

## Problem

Coverage and snapshots on the 0.1.5 merge failed after locale and header pins landed. The Client catalog no longer saw `ctx.betterSidebar` because the public Client entry did not import the Cordis augmentation. Snapshot overlays that restated the `tools` row dropped base `toolSearch`, so deferred `browser_create` refused to register. Generated-host oxlint projects imported `@deepseek-ai/dsh-*/remote`, which resolves to unpublished `lib/` artifacts that coverage never builds. SDK wire goldens still carried `memberQuestionEvents`, and out-of-process DSH SDK tools were pinned with `images` they do not advertise.

## Decision

Re-export `BetterSidebarService` from the public Client entry so Typert Client catalog discovery reaches `src/client/context.ts`. Snapshot and profile patches that replace the `tools` config restate `toolSearch.maxResultBytes: 65536` beside `mode`. Generated-host specs import a committed `tests/typert.remote-client.d.ts` copy of the generated Remote merge, and the oxlint typed project references the Gateway Client face. SDK `result.expected.json` matches `normalizeResult` (`sessionId` and `finalResponse` only). Pin `images` only on in-process `subagent` / `subagent_fork`; out-of-process named tools omit it. PTC schema pins follow live headers (`run_code` only). Issue-management HTTP tests pin `GITHUB_REPOSITORY` so Gestalt CI does not rewrite expected API paths. Snapshot plugins that Node cannot resolve as workspace packages import the package `src/` entry. Inspect catalog fixtures follow live `ToolRuntime` methods (`presentAs` returns a Promise disposer; `allowEligible` / `eligibilityAllow` / `catalogSchemas` are public) and live `ToolExecutionSuccess.loadedTools`. PTC TypeScript prompts declare deferred `tool_search`; the Python PTC sidecar follows live (`run_code` plus in-process `images`, no `tool_search`). `pnpm run gen-config-catalog` is the source of `docs/config-catalog.md`; the Chinese pair follows that generated inventory. `pnpm run gen-cordis-inspect-catalog` owns the Client inspect catalog. Assembled Web composer tests match the hero placeholder string.

## Alternatives considered

**Keep `betterSidebar` as a Host-invisible structural type on `SidebarContext` only.** Rejected: the Client catalog test requires the Cordis augmentation, and discovery walks public Client exports.

**Disable `tool-browser` in snapshot overlays instead of restating `toolSearch`.** Rejected: Browser tools remain part of the headless/SDK composition; the overlay must keep deferred registration legal.

**Map `@deepseek-ai/dsh-*/remote` to source in `tsconfig.base.json`.** Rejected: there is no source for generated Remote dts; the Host generator writes `lib/` after a build that coverage does not run.

## Consequences

A Client Cordis augmentation that catalog tests assert must be reachable from the public `./client` export. Any patch that restates the `tools` row must restate `toolSearch` whenever deferred tools remain mounted. Generated-host oxlint projects stay type-checkable on a clean tree without a prior `pnpm run build`.
