# Agent Note: Better Sidebar persisted Session reads

Status: implemented

English | [中文](2026-09-08-better-sidebar-session-persistence-read-handles.zh.md)

## Problem

Better Sidebar cold routes called `sessionPersistence.inspect()`, which is absent from the handle-based Session Persistence service. A local structural service mirror declared that method, so package typechecks accepted calls that failed at runtime. Side Chat cold resume returned `persistence.inspect is not a function` before Agent resume could report write ownership, and the same stale call remained in cold working-directory and Changes-event reads.

## Decision

`SidebarSessionPersistenceService` is a `Pick<SessionPersistence, 'list' | 'open' | 'stat'>` from the Service Definition package and follows the [handle-based persistence decision](../architecture/2026-08-27-handle-based-session-persistence.md). The package declares that capability as a peer and development dependency, and its TypeScript project references the Service Definition project. Future method and result changes therefore reach Better Sidebar typechecks directly.

`readPersistedSession()` opens a non-owning read handle, reads the validated complete log, and closes the handle before returning its `SessionInspection` metadata and events. A read failure remains the primary error if the same broken reader also fails to close. Route-specific parsing and preset composition start after the handle closes. Cold working-directory lookup propagates read failures; the Changes lens maps an unavailable cold read to an empty window. Side Chat uses the same helper for persisted model inspection and cold-resume setup, `stat()` for a cold model-selection existence check, and `list()` for durable publication during close. The unused thread-log reader is removed.

## Alternatives considered

**Restore an `inspect()` compatibility method on the local mirror.** Rejected because the mirror would continue accepting a method outside the mounted service and would hide later Service Definition changes.

**Route these reads through Session Query.** Rejected because Side Chat needs the persisted preset and model before it invokes Agent resume, while Better Sidebar treats persistence as an optional Host capability and does not require a Session Query provider. A direct read handle preserves that composition and does not introduce live-preferred query behavior into cold-route checks.

## Consequences

Cold Side Chat resume reaches Agent write ownership after its read handle is released, so an active writer produces the ownership error instead of a missing-method failure. Persisted model inspection, cold working-directory fallback, Changes event replay, and durable close publication consume the current persistence service results. Every body read releases its handle on success and failure.

## Testing

Persistence-read tests cover successful metadata and event reads, read failure, cold working-directory propagation, Changes empty fallback, and handle closure on every path. Side Chat lifecycle tests cover formal `stat` and `list` results, successful model and preset recovery, read and parse failures, downstream preset-composition failure, and closure before those downstream operations. The keyless Web Side Chat journey holds an active write handle and verifies that cold resume reaches the expected ownership refusal, retains the draft, and leaves the durable log unchanged.
