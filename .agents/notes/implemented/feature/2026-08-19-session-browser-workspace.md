# Agent Note: Session-owned Browser Workspace

Status: implemented

English | [中文](2026-08-19-session-browser-workspace.zh.md)

## Problem

A Session can open a Browser Profile, but the Runtime still treats Workspaces, instances, and tabs as process-global identities. Switching Session, reloading, or opening a second Session therefore cannot restore that Session's Dock, instances, and tabs without exposing another Session's pages.

## Decision

`dsh-browser-workspace` binds Browser Runtime identities to one Session log. Each Session independently owns zero or more Workspaces. Each Workspace uses one Browser Profile and contains multiple browser instances and tabs. `browser/workspace` is a log-only, last-wins whole-value Session event. The fold restores Dock open/width, instances, active instance, tabs, each tab's last committed revision, and active tab after Session switch and reload.

Runtime `create` may attach a new instance to an existing Workspace or a new tab to an existing instance. Named Profiles still reject a second independent writer with `BROWSER_PROFILE_BUSY`; attaching to an already-open named Profile is the same writer adding another instance or tab. The Consumer routes through the Binder when a calling Agent Session is present and the Binder is composed. Cross-Session page transfer is rejected with `BROWSER_TRANSFER_UNSUPPORTED`. Attach to another live Session's Workspace or instance is also `BROWSER_TRANSFER_UNSUPPORTED`; attach unknown to this Session is `BROWSER_SESSION_MISMATCH`. Session disposal returns leftover-tab cleanup and forgets those tabs from the Session snapshot.

Headless Browser Runtime snapshots stay Binder-free because they prove Consumer discovery and rendered Runtime facts, not Session isolation. Session-local ownership is claimed only where the Binder is composed.

Dock chrome lives in `dsh-client-ui-browser`. Dock open, width, `userCollapsed`, each tab's current control owner, and each tab's last committed revision are Session facts so projection can restore them. Per-tab revision on that listing is owned by the [Dock tab revision Agent Note](../bug-fix/2026-08-20-dock-tab-revision.md). Human and Agent control of one tab lives in the [browser control arbitration Agent Note](2026-08-19-browser-control-arbitration.md). The first Agent tab opens the Dock; later Agent activity does not reopen it after the human collapses it.

## Alternatives considered

**Keep Workspace ownership only in live Runtime memory.** Rejected because Session switch and reload must restore the same instances and tabs from durable Session facts.

**Add a second account or page-transfer service.** Rejected because the ticket forbids cross-Session transfer and a second identity concept.

**Treat Dock open/width as client-only layout store state.** Rejected because each Session must independently remember those facts after switch and reload, including before Dock UI exists.

## Consequences

Two Sessions can own isolated Workspaces over the same Runtime. Reload reconstructs Dock, tab ownership, current control owner, and each tab's last committed revision from the Session log. Named Profiles remain isolated identities. Release remains a later ticket.

## Verification

- `pnpm exec vitest run packages/browser/browser-workspace packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser`
- `pnpm exec vitest run packages/browser/browser-workspace packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser --coverage --coverage.include='packages/browser/browser-workspace/src/**/*.ts' --coverage.include='packages/browser/browser-runtime/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-deterministic/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts' --coverage.include='packages/browser/tool-browser/src/**/*.ts'`
- `pnpm run test:snapshot -t 'temporary Browser Profile|Tandem Browser Profile'`
