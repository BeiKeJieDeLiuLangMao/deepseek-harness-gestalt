# Agent Note: Retire the client runtime package

Status: implemented

English | [中文](2026-09-07-retire-client-runtime-package.zh.md)

## Problem

The temporary `@deepseek-ai/dsh-client-runtime` package duplicated Client Session, Workspace, conversation, slot, and lineage ownership after those responsibilities moved to their dedicated packages. Keeping the empty migration boundary in the workspace preserved stale TypeScript references, generated aliases, package metadata, and tests for contracts that no longer exist.

## Decision

The workspace omits `packages/client/runtime`. Session and Workspace behavior belongs to the API controllers, conversation assembly belongs to `ui-conversation`, slot rendering belongs to `ui-renderer`, and subagent lineage belongs to its current presentation owners. Product packages reference those owners directly.

The workspace graph omits the package's TypeScript references, generated alias and catalogs, lockfile importer, compiler-face registration, and invariant documentation.

The old `PendingWait.respond()` response envelope and its `rpcId` backfill are absent because the current interaction protocol settles `$events` by `clientId` and `eventId`.

## Testing

Session Controller tests cover admission and provisional identities. Workspace Controller tests cover mutations, ordering, archive state, and directory selection. `ui-workspace` and `ui-subagent` tests cover lineage counts. Desktop Companion product and interaction tests generate the Typert Remote artifacts, then cover `$events` correlation through `clientId` and `eventId`. Workbench tests resolve Browser Workspace's public `/client` entry directly to its browser-safe source.

The package-manager frozen-lock check, generated path and catalog checks, compiler-face tests, and consumer suites verify that repository graphs no longer require the package. The remaining Workbench external-policy violations require their own owner migration and are not evidence for restoring this package.

## Alternatives considered

**Keep a compatibility barrel.** This would preserve imports and tests for ownership that no production consumer uses, obscure missing current-owner dependencies, and allow deleted contracts such as `PendingWait.respond()` to return.

**Move every old test unchanged.** Several tests exercised the removed `SessionRuntime` implementation or obsolete wire fields rather than current behavior. Current-owner tests retain the relevant behavior without recreating the package.

**Delete only the source directory.** Leaving aliases, project references, catalogs, lock entries, and invariant prose would keep the package in repository graphs and make clean-tree checks disagree about whether it exists.

## Consequences

The Client graph has one fewer package and no compatibility route for `@deepseek-ai/dsh-client-runtime`. Consumers must import current owners or use their Cordis services. Historical Agent Notes remain historical records and may name the retired package, but active generated inventories and compiler graphs do not.

Source-plane package compilation can still expose independent browser-safe type-import problems in current owners; retirement does not justify adding Node types to Client programs or restoring the removed runtime package.
