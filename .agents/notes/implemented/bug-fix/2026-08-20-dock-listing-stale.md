# Agent Note: Dock listing follows Runtime-internal revision bumps

Status: implemented

English | [中文](2026-08-20-dock-listing-stale.zh.md)

## Problem

Dock and preview send the addressed tab's listing revision from `BrowserWorkspaceTabRecord`. The Binder wrote that record on Binder-mediated mutations, but Runtime-internal revision bumps did not: Electron crash recovery commits `unavailable` (+1), `reconnect` (+1), or `reconnect-failed` without a Binder verb. After a background tab recovered, its listing revision stayed stale, Runtime rejected with `BROWSER_REVISION_CONFLICT`, and the chips invoked focus or close without catching the rejection.

A Binder `observe` of an already-closed tab also left the listing row in place, so a ghost chip's close kept conflicting.

## Decision

The Binder listens to `browser/runtime-state` and `recordFacts` for an owned, unclosed tab so an internal bump reaches the listing. A closed Runtime-state notification does not write facts; `observe` of a closed tab forgets the row so the ghost chip disappears.

Dock and preview treat `BROWSER_REVISION_CONFLICT` on a listed row as recoverable: they observe that tab once and retry with the observed revision, or show `dock.actionFailed` when the failure is not a conflict or the retry still fails. Observe of closed returns without retry because the Binder already forgot the row. Active-tab chrome that re-observes when the listing revision advances stays in the [Dock navigate chrome Agent Note](2026-08-20-dock-navigate-chrome.md); this decision owns background chips and revision-conflict recovery.

This extends the listing in the [Dock tab revision Agent Note](2026-08-20-dock-tab-revision.md).

## Alternatives considered

**Have Dock subscribe to `browser/runtime-state`.** Rejected because the listing is the Session fact every chip already reads, and the Binder is the only writer that restores after reload.

**Keep the ghost row after observe-of-closed.** Rejected because close keeps hitting `BROWSER_REVISION_CONFLICT` and no other verb removes the row.

**Swallow a failed retry.** Rejected because a silent dead button is the original defect.

## Consequences

A Runtime-internal bump writes `browser/workspace` without a Binder verb. Observe of closed is now destructive to the listing. Gateway still maps `BrowserRuntimeError` to `internal`; recovery matches the stable code or the `revision conflict` wording on `message`. The keyless fixture Session still has one tab, so the assembled Dock snapshot cannot exercise a two-tab revision conflict.

## Testing

`packages/browser/browser-workspace/tests/workspace.spec.ts` pins a Runtime-internal navigate onto the listing, a succeeding listed focus/close after that bump, Runtime-state filters for closed and unowned targets, and observe-of-closed forgetting the ghost row. `packages/client/ui-browser/tests/listed-mutation.client.spec.ts`, `browser-dock.client.spec.tsx`, and `browser-preview.client.spec.tsx` pin observe-once retry and a visible alert when recovery fails.
