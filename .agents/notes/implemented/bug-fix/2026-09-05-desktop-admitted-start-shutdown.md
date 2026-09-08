# Agent Note: Desktop admitted startup shutdown ownership

Status: implemented

English | [中文](2026-09-05-desktop-admitted-start-shutdown.zh.md)

## Problem

A Web Host spawn promise does not cover Browser and Membership initialization before spawning, the ready-result handoff, or an old Host awaiting retirement. Shutdown can miss resources created by an already admitted operation. Checking an aborted signal inside the spawn adapter cannot establish ownership of those earlier and later intervals.

## Decision

Desktop consumes [DesktopHostLifecycle](../../../../apps/desktop/src/host-lifecycle.ts) for start, replacement, and shutdown. Startup admission is published before creators run; concurrent requests join that operation. The owner retains returned runtime and Host handles before checking cancellation. Shutdown publishes its memoized task before abort callbacks, joins admitted startup, stops exact current and retiring Hosts, and disposes runtimes even when another cleanup fails. Startup never awaits shutdown. The spawn adapter rejects failed pre-ready stops with `WebHostStartupCleanupError`, an `AggregateError` with literal kind `startup-cleanup-failed`, the original `startupError`, unmodified `cleanupError`, both in `errors`, and the startup error as `cause`; the owner retains this typed failure even if no Host handle was returned or startup has already settled. Ordinary startup rejection is not automatically a cleanup failure. Shutdown aggregates the retained cleanup failure after all other cleanup attempts, without claiming child exit. Rejected initializers clean partial resources they never returned; the owner rolls back newly acquired runtimes on initializer failure and retains failed disposal outcomes.

Runtime singletons survive ordinary Host retries and replacements. Initial retry, one-respawn decisions, timeouts, Companion installation, and navigation remain caller policy. Callers check current ownership and closed admission before publishing readiness after awaits. [DesktopShutdown](../../../../apps/desktop/src/shutdown.ts) preserves first-request mode/code, observes independent cleanup failures, and invokes explicit exit only after settlement; cleanup failure uses code 1. Diagnostic sink exceptions are contained after cleanup settlement and cannot suppress that exit. The request promise resolves after policy handling even for cleanup failure; callers cannot use resolution as a successful shutdown or child-exit acknowledgment.

The [direct-child exit provenance decision](2026-09-05-web-host-exit-provenance.md) remains independently applicable: a failed stop is not proof of child exit. Native allow-quit/repeated-quit behavior and earlier boot operations before Host admission are outside this guarantee. No process discovery, descendant containment, helper IPC, or new retry policy is introduced.

## Alternatives considered

**Only check abort before spawning.** This leaves late runtime creation and replacement retirement outside shutdown ownership.

**Await shutdown from canceled startup.** Shutdown already joins admitted startup; the reciprocal await deadlocks.

**Use a generic pending-task broker.** The required state consists of Desktop runtime singletons and exact Host handles; a Desktop-local owner keeps resource transfer and tests at the production operation.

## Consequences

Controlled fake adapters in [the owner tests](../../../../apps/desktop/tests/host-lifecycle.spec.ts) exercise browser/membership readiness, cancellation, ready handoff, retiring Host exit, initializer rejection, synchronous reentry, and cleanup failure. [Shutdown tests](../../../../apps/desktop/tests/shutdown.spec.ts) exercise first-request and independent-failure semantics without Electron. These tests do not establish live Desktop shutdown, native quit waiting, or process-tree containment. No model transcript or SDK event changes occur; live headless acceptance remains a separate test tier.
