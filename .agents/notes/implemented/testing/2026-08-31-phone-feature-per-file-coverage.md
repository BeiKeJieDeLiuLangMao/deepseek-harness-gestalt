# Agent Note: Phone feature per-file coverage inventory

Status: implemented

English | [中文](2026-08-31-phone-feature-per-file-coverage.zh.md)

## Problem

The phone feature adds lifecycle, transport, model-tool, renderer, and platform-resolution branches across `phone-runtime`, `phone-stream`, `tool-phone`, and `ui-phone`. The repository coverage gate evaluates each source file independently at 100%, so happy-path interaction tests alone leave release-blocking gaps in stale generations, invalid surfaces, offline and unauthorized responses, resolver failures, and browser registration wiring.

## Decision

The phone packages keep every owned source file in the normal coverage inventory. Their tests exercise runtime startup and shutdown, executable resolution, publication invariants, device listing and switching, model-tool actions, H264 playback and surface ownership, connection generations and retries, capture proxy cancellation and failure containment, normalized input mapping, failure copy, and plugin registration. Defensive branches that protect terminal phases, invalid device dimensions, or process and wire failures have explicit outcome assertions. Closed typed unions use exhaustive typed tables when their inputs cannot carry another variant; new variants fail at typecheck without an unreachable runtime arm. Owned lifecycle invariants likewise omit guards for states their single owner cannot produce. No phone path uses a coverage exclusion, ignored range, reduced threshold, or test-only production branch.

## Alternatives considered

**Exclude browser and platform-specific phone files.** Rejected: their behavior is deterministic through the existing transport, WebCodecs, filesystem, and process seams, and exclusions would hide the shipped lifecycle paths.

**Cover branches by calling helpers without checking results.** Rejected: the coverage inventory must preserve the user-visible and lifecycle obligation behind each branch, including cleanup and terminal-state behavior.

## Consequences

Changes to `packages/phone/phone-runtime/src/**`, `packages/phone/phone-stream/src/**`, `packages/phone/tool-phone/src/**`, or `packages/client/ui-phone/src/**` require a behavior case for every new statement, function, and branch. Platform-specific launcher cases remain conditional tests, while the shared source inventory still reaches 100% on the supported coverage lane.

## Verification

Verification runs each owning inventory under the normal per-file thresholds for statements, branches, functions, and lines. The repository partitioned coverage lane remains the merge authority.
