# Agent Note: Browser Workspace reads Session snapshots and writes ignorable workspace events

Status: implemented

English | [中文](2026-09-05-browser-workspace-session-snapshot-events.zh.md)

## Problem

Browser Workspace reconstructed Session-owned tabs from a live `Session.events` array that Typert diagnostics refuse, and its final `browser/workspace` append omitted `ignorable: true`. Readers that do not mount the Binder then treat the event as required-on-read.

## Decision

The Binder folds `Session.snapshotEvents()` for the last-wins Workspace, including a fork-inherited prefix. That reconstruction is historical display. Live Runtime authority is the process-local Session that `adopt`ed the tab in this Binder, rebuilt after Binder HMR from targets each live Session introduced after its inherited prefix. A later whole snapshot that still lists an inherited tab is display metadata, not adopt. Two Sessions that both introduced the same remaining tab fail loudly. Browser Runtime create and `browser/runtime-state` events do not carry a Session id. Operate, attach, cleanup, and disposal close only adopted tabs. A child leaving the store does not close the parent's live target. `foldBrowserWorkspace`'s optional `end` remains an exclusive array index into the supplied event array, not a `SessionSeq`. The final `session.append('browser/workspace', snapshot, { ignorable: true })` marks the log-only event skippable for unknown-type readers. The invariant companion validates every `snapshotEvents()` record and still ignores unrelated types, including an unknown ignorable event when the companion is not mounted.

## Alternatives considered

**Restore a compatibility `Session.events` getter.** Rejected because Typert diagnostics exist to stop live-array reads; a getter would hide the same defect.

**Disable Typert diagnostics for this package.** Rejected because the default generate path must stay a real check.

**Fold only `ownEvents()` in `snapshot()`.** Rejected because Browser Workspace last-wins across the whole Session log, including a fork-inherited prefix. Schedule's child-owned cut is a different product rule.

**Leave `browser/workspace` required-on-read.** Rejected because omitting the Workspace snapshot must not refuse a Session whose reconstruction does not depend on Browser tabs.

## Consequences

Unknown-type readers can skip Browser Workspace snapshots. Binder-mounted readers still fold last-wins state from the frozen snapshot API. A forked Session reconstructs inherited Workspace display through `snapshot(child)` while the creating Session keeps live Runtime verbs until it forgets, cleans up, or leaves the store. Binder HMR restores that live map from targets introduced after each Session's inherited prefix, without granting a child inherited operate rights.
