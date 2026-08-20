# Agent Note: Windows coverage cannot measure workflow worker-thread sources

Status: implemented

English | [中文](2026-08-20-windows-worker-thread-coverage.zh.md)

## Problem

The native Windows coverage inventory runs `packages/workflow/workflow-worker-thread/tests/session.spec.ts` and the tests pass. The same job then fails per-file 100% on `src/index.ts` and `src/host.ts` (lines ~83/84%, branches ~75/65%). Linux coverage on the same sources is 100%. The gap is Windows v8 coverage not attributing work that runs inside `worker_threads` back to those two files. Ticket PRs that only fix Linux coverage on other packages still go red on this Windows inventory.

## Decision

**Exclude the two worker-attributed sources from coverage on `win32` only.** `vitest.config.ts` adds `packages/workflow/workflow-worker-thread/src/index.ts` and `src/host.ts` to the existing Windows coverage exclusion list beside the confinement runner entry. Linux coverage still owns the 100% bar. The session suite stays in the Windows test inventory.

## Verification

`session.spec.ts` remains in `processBoundTests` and is not added to `windowsUnsupportedTests`. The Windows exclude list names the two files that fail the native inventory when tests pass. Linux coverage configuration is unchanged.

## Alternatives considered

**Rerun the Windows job until coverage luckily attaches.** Rejected: #155, #170, and #158 failed the same two files after tests passed. A retry does not change instrumentation.

**Exclude the whole `workflow-worker-thread` package on Windows.** Rejected: only `index.ts` and `host.ts` miss the threshold; the rest of the package already meets 100% on the failing jobs.

**Lower the Windows per-file threshold.** Rejected: that hides every other Windows coverage regression.

## Consequences

Native Windows no longer fails ticket PRs for an instrumentation gap those PRs do not own. Linux still refuses a coverage drop in the worker-thread package.
