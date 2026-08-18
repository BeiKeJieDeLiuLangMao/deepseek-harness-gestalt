# Agent Note: Session-owned Browser Workspace

Status: implemented

English | [中文](2026-08-19-session-browser-workspace.zh.md)

## Problem

A Session can open a Browser Profile, but the Runtime still treats Workspaces, instances, and tabs as process-global identities. Switching Session, reloading, or opening a second Session therefore cannot restore that Session's Dock, instances, and tabs without exposing another Session's pages.

## Decision

`dsh-browser-workspace` binds Browser Runtime identities to one Session log. Each Session independently owns zero or more Workspaces. Each Workspace uses one Browser Profile and contains multiple browser instances and tabs. `browser/workspace` is a log-only, last-wins whole-value Session event. The fold restores Dock open/width, instances, active instance, tabs, and active tab after Session switch and reload.

Runtime `create` may attach a new instance to an existing Workspace or a new tab to an existing instance. Named Profiles still reject a second independent writer with `BROWSER_PROFILE_BUSY`; attaching to an already-open named Profile is the same writer adding another instance or tab. The Consumer routes through the Binder when a calling Agent Session is present and the Binder is composed. Cross-Session page transfer is rejected with `BROWSER_TRANSFER_UNSUPPORTED`.

Dock UI and human handoff remain later work. Dock open and width are Session facts now so later projection can restore them.

## Alternatives considered

**Keep Workspace ownership only in live Runtime memory.** Rejected because Session switch and reload must restore the same instances and tabs from durable Session facts.

**Add a second account or page-transfer service.** Rejected because the ticket forbids cross-Session transfer and a second identity concept.

**Treat Dock open/width as client-only layout store state.** Rejected because each Session must independently remember those facts after switch and reload, including before Dock UI exists.

## Consequences

Two Sessions can own isolated Workspaces over the same Runtime. Reload reconstructs Dock and tab ownership from the Session log. Named Profiles remain isolated identities. Dock UI, handoff, and release remain later tickets.

## Verification

- `pnpm exec vitest run packages/browser/browser-workspace packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser`
- `pnpm exec vitest run packages/browser/browser-workspace packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser --coverage --coverage.include='packages/browser/browser-workspace/src/**/*.ts' --coverage.include='packages/browser/browser-runtime/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-deterministic/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts' --coverage.include='packages/browser/tool-browser/src/**/*.ts'`
- `pnpm run test:snapshot -t 'temporary Browser Profile|Tandem Browser Profile'`
