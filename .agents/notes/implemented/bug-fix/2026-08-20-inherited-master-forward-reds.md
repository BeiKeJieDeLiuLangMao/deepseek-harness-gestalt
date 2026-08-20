# Agent Note: Repair inherited master-forward CI reds

Status: implemented

English | [中文](2026-08-20-inherited-master-forward-reds.zh.md)

## Problem

A merge-forward of `origin/master` onto the Mobile Companion delivery baseline imported three red lanes that no open ticket pull request caused. Linux coverage misses the `requireRouteField` true arm at `packages/subagent/tool-subagent/src/index.ts:283` (`field === 'provider' ? 'adapter route' : 'model id'`). Consumers-lane oxlint rejects a useless `String()` around `tool/call` `arguments` in `packages/subagent/subagent-spawn-in-process/tests/spawn-in-process.e2e.ts`. jscpd reports one six-line clone of the `assertBrowserNotAborted` + `exclusive` + `openPage` + `expectRevision` preamble in `packages/browser/browser-runtime-tandem/src/index.ts` at navigate, focus, and input. Native Windows coverage then fails the same tandem file at the unexpected-exit schedule (`processExited` 553–555) and the reconnect / catch path (`scheduleRecovery` 578, 582, 592–595) after the tests pass; Linux coverage on that file is already 100%. Master push lanes do not run pull-request coverage, lint, or duplication, so the reds reached both remaining ticket PRs identically. [The earlier baseline-red repair](2026-08-19-inherited-ci-baseline-reds.md) and [ticket-rerun handshake note](2026-08-20-ci-ticket-rerun-flakes.md) own different failures.

## Decision

**Empty LLM route fields reject both names.** `requireRouteField` still throws on empty or whitespace `provider` and `model`. The tool-subagent suite now pins both ternary arms: `provider` uses `adapter route`, `model` uses `model id`. [The per-call route note](../feature/2026-08-19-subagent-per-call-llm-route.md) still owns the rejection rule.

**`tool/call` arguments stay a string.** The spawn-in-process e2e asserts `call.data.arguments` directly. The session event type is already `string`; wrapping it in `String()` does not change the value and trips oxlint.

**One `mutateOpenPage` helper owns the mutation preamble.** Navigate, focus, and input call that helper and then run their HTTP bodies. The helper is not copied a fourth time, and screenshot / close keep their distinct preambles.

**Unexpected-exit recovery is invoked on the test thread.** `runtime.spec.ts` uses two fixtures: one calls `processExited` with the live child handle after stubbing `reconnect` to reject, and the other calls `scheduleRecovery(..., true)` on a still-open page. Those calls run in the Vitest process so Windows v8 can attribute them. Child `done` callbacks already reach the same methods on Linux and are not treated as a Windows coverage exclude. [The worker-thread Windows exclude](2026-08-20-windows-worker-thread-coverage.md) stays; this file is not added to `windowsRunnerCoverageExclusions` or `windowsOnlyCoverageExclusions`. `#171` `remote-access` index excludes stay.

## Testing

`packages/subagent/tool-subagent/tests/tool-subagent.spec.ts` rejects empty and whitespace `provider` and `model` with the matching error text. `packages/browser/browser-runtime-tandem/tests/runtime.spec.ts` plus `runtime-invariant.spec.ts` keep Linux per-file 100% on `src/index.ts` and add the in-process unexpected-exit / rejected-reconnect case. Oxlint on the spawn-in-process e2e file and `pnpm run duplication` own the lint and clone lanes.

## Alternatives considered

**Exclude `browser-runtime-tandem/src/index.ts` from Windows coverage.** Rejected: the missed lines are ordinary methods the test process can call. That is not the worker-thread attribution gap [the Windows worker-thread note](2026-08-20-windows-worker-thread-coverage.md) records. An exclude would hide a later real miss.

**Leave the `String()` wrap and disable the oxlint rule.** Rejected: the conversion is a no-op. Removing it keeps the assertion and satisfies the rule.

**Mark the tandem preamble with `jscpd:ignore`.** Rejected: the three callers share one contract. A helper deletes the clone instead of blessing a fourth copy.

**Change `requireRouteField` to a single error string.** Rejected: the two field names are the model-visible vocabulary in [the per-call route note](../feature/2026-08-19-subagent-per-call-llm-route.md). Coverage comes from exercising both arms, not from collapsing the diagnostic.

## Consequences

Ticket PRs that only merge this baseline no longer inherit these coverage, oxlint, and duplication reds. Linux tandem coverage stays at per-file 100%. Windows coverage of the recovery methods depends on the in-process calls, not on child-exit callbacks. Worker-thread and remote-access Windows excludes are unchanged.
