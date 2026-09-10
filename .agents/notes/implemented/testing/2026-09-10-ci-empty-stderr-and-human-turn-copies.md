# Agent Note: Empty stderr tails and unique human-turn copies

Status: implemented

English | [中文](2026-09-10-ci-empty-stderr-and-human-turn-copies.zh.md)

## Problem

The coverage inventory requires every branch in `mobilecli-phone-runtime.ts`, including `tailOf` when child stderr is empty. The fakemobilecli listen banner always writes stderr, so readiness-timeout and exit-before-ready cases never observe `(empty)`.

Assembled member-question admission records one human turn as both `agent/inbox/spliced` and, after claim, `user/message`. Counting those events as a union therefore reports two copies of one `rpcId` even when Host retry did not duplicate the Session or turn.

## Decision

The fake binary accepts a `quiet` knob that suppresses the listen banner and the exit-fast stderr line. The phone-runtime service suite times out a quiet hung server and asserts the readiness failure message ends with `(empty)`.

Member-question receiving e2e counts copies of one human-turn id as the larger of the `user/message` count and the matching `agent/inbox/spliced` insert count. One of each remains a single turn; two events of the same type remain a duplicate.

## Alternatives considered

**Ignore the empty `tailOf` branch.** Rejected because the phone coverage inventory forbids per-file exclusions and reduced thresholds.

**Keep counting the event-type union.** Rejected because a successful `followup` plus claim is the production log, not a second prompt.

**Wait longer and keep the original length assertion.** Rejected because the failure is the identity of two event types, not a race that extra polling can collapse.

## Consequences

Quiet fakemobilecli startups are test-only. Product readiness diagnostics still append a 2000-character stderr tail or `(empty)`. Admission retry still refuses a second Session, `turn/start`, or second copy of either human-turn event type.

## Testing

The quiet hang case lives in `packages/phone/phone-runtime/tests/service.spec.ts`. Unique-copy counting lives in `apps/web/tests/member-question-receiving.e2e.ts` for post-create, post-record, post-prompt, and reserved Host-restart admission.
