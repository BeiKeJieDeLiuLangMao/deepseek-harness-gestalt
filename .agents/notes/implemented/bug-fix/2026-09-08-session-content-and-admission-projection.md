# Agent Note: Session content and admission projections

Status: implemented

English | [中文](2026-09-08-session-content-and-admission-projection.zh.md)

## Problem

Opening persisted history does not activate its parent Agent. A Side Chat can own cold continuation through its admission adapter while the generic subagent composer blocks it on the parent’s live availability. Separately, a received Member Question contains a Decision Brief without a model turn, so turn-only blankness hides a Session that already needs human attention.

## Decision

Session Controller projects the prompt dispatcher it actually selects: registered feature admission takes precedence, otherwise the retained subagent address selects subagent delivery, and ordinary Sessions use Session delivery. Registration and revocation refresh that value even before history opens. The continuation composer defers to a feature owner without altering the real parent availability or subagent address. One-shot history, unowned offline continuations, and independent Stop retain their existing rules. The Host still owns authorization and permission checks.

Session-list metadata becomes nonblank on either a turn start or a received Member Question. Configuration-only events remain blank, and receiving a brief creates no synthetic turn. Metadata state version 2 invalidates older checkpoints so the ordinary projection restore path refolds the log.

## Verification

Admission, composer, and InputBar tests cover cold-parent feature submission, real parent availability, one-shot behavior, and revocation. A keyless Web composition closes the Host, restores its persisted state, opens the original child, and continues through its own model from a cold-parent baseline. Receiving Loader coverage verifies visible metadata with zero turns and refolding a version-1 checkpoint.

## Alternatives considered

**Resume the parent or report it available when a child is selected.** This changes passive history navigation and falsifies the catalog’s live-Agent fact instead of respecting the child’s existing admission owner.

**Expose every blank Session or synthesize a model turn for incoming questions.** This exposes empty drafts or corrupts the received-brief lifecycle. The event-derived content bit is sufficient.

## Consequences

Consumers distinguish history availability, live parent availability, prompt ownership, and meaningful received content. None of these projections grants an admission route or Host permission by itself.
