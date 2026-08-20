# Agent Note: Headless defaults snapshot uses a CI-safe idle keep-alive schedule

Status: implemented

English | [中文](2026-08-20-headless-defaults-idle-keep-alive.zh.md)

## Problem

The DeepSeek-defaults headless snapshot must prove two facts on the assembled one-shot path: SSE comments rearm `streamIdleTimeoutMs`, and adapter defaults (`max_tokens`, `reasoning_effort`) reach the provider. [The ticket-rerun handshake note](2026-08-20-ci-ticket-rerun-flakes.md) wrote the first comment when the request arrived and then finished the stream on `end` with no delay. That removed the keep-alive proof from the snapshot and left `streamIdleTimeoutMs: 150` armed across every scheduling gap, including TCP flush and the event-loop delay between writes. A loaded consumers-lane runner still aborted as `TIMEOUT`, `dsh-llm-retry` issued a second POST, and `requests.length === 1` failed on PR #179 after that handshake shipped.

## Decision

**The snapshot keeps both proofs and sizes the idle budget for CI.** `streamIdleTimeoutMs` is 5000ms. The mock writes headers and the first `: keep-alive` when the request arrives, then further comments at 2000ms and 4000ms, and the deterministic payload at 7000ms. A missing comment pulse would expire the 5000ms budget before the payload; a loaded runner's millisecond-scale jitter cannot. `requests.length === 1` stays: a TIMEOUT retry is a fixture failure, not tolerated product behavior. The fake-clock adapter unit test (`keeps an idle provider read alive through SSE comments`) still pins sub-second comment pulsing.

## Verification

`examples/headless-agent/tests/headless.snapshot.ts` `keeps provider comments alive and sends DeepSeek defaults through the one-shot app` passes five consecutive local runs against the in-process mock.

## Alternatives considered

**Keep `streamIdleTimeoutMs: 150` and only flush the first comment earlier.** Rejected: any 150ms delivery gap on a loaded runner retriggers TIMEOUT, including gaps after the first byte.

**Tolerate `requests.length >= 1` when retry bodies match.** Rejected: that hides a TIMEOUT abort. The snapshot must prove one successful POST.

**Drop assembled keep-alive and leave it to the fake-clock unit test.** Rejected: the unit test mocks `fetch`. The snapshot is the one-shot composition that arms the real idle watchdog.

## Consequences

The snapshot still fails if comments stop rearming the watchdog or if defaults disappear from the POST. It no longer fails because a consumers-lane event loop stalled for a few hundred milliseconds. The 150ms schedule in [the ticket-rerun handshake note](2026-08-20-ci-ticket-rerun-flakes.md) is superseded for this fixture.
