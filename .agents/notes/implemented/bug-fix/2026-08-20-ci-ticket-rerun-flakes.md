# Agent Note: Deterministic ticket-rerun CI handshakes

Status: implemented

English | [中文](2026-08-20-ci-ticket-rerun-flakes.zh.md)

## Problem

After the inherited-baseline repair in [2026-08-19-inherited-ci-baseline-reds](2026-08-19-inherited-ci-baseline-reds.md) merged, every open Mobile Companion ticket PR still failed overlapping CI lanes. Two failures are baseline flakes that block every PR that reaches those gates, not ticket content.

The DeepSeek-defaults headless snapshot (`keeps provider comments alive and sends DeepSeek defaults through the one-shot app`) sets `streamIdleTimeoutMs: 150` so SSE comments must rearm the adapter idle watchdog. That watchdog arms when `stream()` waits for the first iterator value, which is after `fetch` receives response bytes. The mock wrote headers and the first comment only on `request` `end`, and then delayed further comments with `setTimeout`. Under consumers-lane load the gap from watchdog arm to first byte exceeds 150ms, the adapter aborts as `TIMEOUT`, `dsh-llm-retry` issues a second POST, and the snapshot asserts `requests.length === 1`. Writing the first comment immediately after `end` still loses when `end` itself is late.

The process-exit host-exit suite waits for `ready` before reading `tree.json`, but the host still parsed `tree.json` as soon as `access()` succeeded. `writeFile` creates the path before the JSON payload is durable, so a loaded coverage worker can `JSON.parse` an empty prefix (`Unexpected end of JSON input`), exit 1, and fail `removes an ordinary managed tree after 'unhandled-rejection'`.

## Decision

**The defaults snapshot mock writes the first SSE comment when the request arrives.** Headers and `: keep-alive` leave the socket before the body is fully read, so `fetch` unblocks and the comment pulses the 150ms watchdog inside the configured idle budget. After `end`, the mock records the body and finishes the remaining comments plus the deterministic payload in the same turn — no `setTimeout`. Delayed-comment keep-alive remains the adapter unit test's contract (`keeps an idle provider read alive through SSE comments`); this snapshot owns one-shot defaults and comment-tolerant SSE framing.

**The managed-tree fixture publishes `tree.json` atomically, and the host waits for valid JSON.** The child writes a sibling `.tmp` file and `rename`s it onto `tree.json`. The host retries `readFile` + `JSON.parse` until `root` and `descendant` are safe integers, treating `ENOENT` and `SyntaxError` as not-yet-published. `access()` is not a payload-ready signal.

## Verification

`examples/headless-agent/tests/headless.snapshot.ts` `keeps provider comments alive and sends DeepSeek defaults through the one-shot app` passes locally against the in-process mock. `packages/subprocess/subprocess-local/tests/process-exit.spec.ts` passes locally, including `removes an ordinary managed tree after 'unhandled-rejection'`.

## Alternatives considered

**Keep delayed comments in the snapshot and only flush the first byte after `end`.** Rejected: `end` is still on the loaded event loop, so the 150ms first-byte window remains a race. The adapter unit test already pins delayed comments with fake timers.

**Accept `requests.length >= 1` and require identical retry bodies.** Rejected: that hides a TIMEOUT retry instead of removing the abort. The snapshot must prove one successful one-shot POST.

**Leave `waitForFile(access)` and only lengthen the host timeout.** Rejected: an empty `tree.json` fails immediately with `SyntaxError`, not a timeout. The host must wait for a complete published record.

## Consequences

Ticket PRs that reach `test:snapshot` no longer inherit a one-shot retry flake from this mock. Coverage lanes no longer inherit a truncated-`tree.json` host crash from this handshake. Ticket-owned oxlint, catalog, knip, and coverage-threshold failures stay on those PRs.
