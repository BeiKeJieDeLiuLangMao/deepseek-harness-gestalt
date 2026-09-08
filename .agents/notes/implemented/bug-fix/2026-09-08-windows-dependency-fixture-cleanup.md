# Agent Note: Await bounded Windows dependency fixture cleanup

Status: implemented

English | [中文](2026-09-08-windows-dependency-fixture-cleanup.zh.md)

## Problem

The dependency preparation gate can fail while deleting its owned fixture after a pnpm child returns. [Issue #630](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/630) records two Windows `rmSync` EPERM failures on the same source tree. A real Windows Node 24.19.0 probe holds one ordinary fixture file without delete sharing for 700 ms: the current cleanup fails in 0–1 ms despite its configured retries, while asynchronous removal with the same options succeeds in 1031–1032 ms. Both observations repeat. Six isolated executions of the first actual policy scenario pass; the CI file holder or permission source remains unidentified.

## Decision

Final fixture removal uses Node asynchronous `rm` with the existing `recursive: true`, `force: true`, `maxRetries: 10`, and `retryDelay: 100`. The gate awaits cleanup through `removeFixtureRoot`, `finishFixture`, `useFixture`, each scenario, and `main`, preserving scenario order. Cleanup unlinks symbolic links and junctions without traversing their targets. A final cleanup failure remains fatal; when the scenario and cleanup both fail, retain both original errors. An aborted scenario retains already collected policy violations alongside its original exception; it cannot start the next fixture.

The [dependency preparation policy](../process/2026-09-05-dependency-preparation-policy.md) continues to own preparation, rejection and override semantics. The cleanup mechanism preserves that policy and its fixture composition.

## Alternatives considered

**Increase synchronous retries.** The controlled Windows probe demonstrates immediate failure despite ten configured retries. Increasing a value that the observed failure does not honor would not establish cleanup completion.

**Ignore final EPERM.** A successful gate would leave owned state behind and hide an unresolved lifecycle failure. Cleanup must complete or report its error.

## Verification

Windows regressions exercise a real child-held ordinary file: a short hold releases within the existing budget and removal completes; a sustained hold rejects. Tests await the holder and verify final cleanup. Portable tests cover awaited removal, awaited cleanup after primary failure, final rejection, both-error retention, dangling links and preserved external targets. The complete offline policy fixture exercises all rejection, recovery and override scenarios.

## Consequences

Every caller must await the cleanup promise before starting the next fixture or exiting. The controlled holder proves a cleanup weakness, not the unidentified CI holder. Repeated policy failures must remain diagnosable instead of being hidden by cleanup. Cleanup completion adds a wait between fixtures without weakening their assertions or extending the retry budget.
