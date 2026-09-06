# Agent Note: Retire the client runtime package

Status: implemented

English | [中文](2026-09-07-retire-client-runtime-package.zh.md)

## Problem

The temporary `@deepseek-ai/dsh-client-runtime` package duplicated Client Session, Workspace, conversation, slot, and lineage ownership after those responsibilities moved to their dedicated packages. Keeping the empty migration boundary in the workspace preserved stale TypeScript references, generated aliases, package metadata, and tests for contracts that no longer exist.

## Decision

The workspace omits `packages/client/runtime`. Session and Workspace behavior belongs to the API controllers, conversation assembly belongs to `ui-conversation`, slot rendering belongs to `ui-renderer`, and subagent lineage belongs to its current presentation owners. Product packages reference those owners directly.

The package source and its obsolete tests were removed in commit `511366c0953fb30ce1742b68ea2f3f4c4f5d2a68`. The follow-up retirement commit removes the remaining TypeScript references, generated package alias and catalogs, lockfile importer, compiler-face registration, and stale invariant documentation.

Tests for the removed package are retained only where a current owner still implements the behavior. Session admission and provisional identities are covered by Session Controller tests; Workspace mutations, ordering, archive state, and directory selection are covered by Workspace Controller tests; lineage counts are covered by `ui-workspace` and `ui-subagent`; Desktop Companion interaction correlation uses generated `$events` client and event identities. The old `PendingWait.respond()` response envelope and its `rpcId` backfill are not migrated because the current interaction protocol settles `$events` by `clientId` and `eventId`.

## Alternatives considered

**Keep a compatibility barrel.** This would preserve imports and tests for ownership that no production consumer uses, obscure missing current-owner dependencies, and allow deleted contracts such as `PendingWait.respond()` to return.

**Move every old test unchanged.** Several tests exercised the removed `SessionRuntime` implementation or obsolete wire fields rather than current behavior. Current-owner tests retain the relevant behavior without recreating the package.

**Delete only the source directory.** Leaving aliases, project references, catalogs, lock entries, and invariant prose would keep the package in repository graphs and make clean-tree checks disagree about whether it exists.

## Consequences

The Client graph has one fewer package and no compatibility route for `@deepseek-ai/dsh-client-runtime`. Consumers must import current owners or use their Cordis services. Historical Agent Notes remain historical records and may name the retired package, but active generated inventories and compiler graphs do not.

Source-plane package compilation can still expose independent browser-safe type-import problems in current owners; retirement does not justify adding Node types to Client programs or restoring the removed runtime package.
