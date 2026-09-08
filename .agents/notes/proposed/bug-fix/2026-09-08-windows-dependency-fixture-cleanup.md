# Agent Note: Await bounded Windows dependency fixture cleanup

Status: proposed

English | [中文](2026-09-08-windows-dependency-fixture-cleanup.zh.md)

## Problem

The dependency preparation gate can fail while deleting its owned fixture after a pnpm child returns. [Issue #630](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/630) records two Windows `rmSync` EPERM failures on the same source tree. A real Windows Node 24.19.0 probe holds one ordinary fixture file without delete sharing for 700 ms: the current cleanup fails in 0–1 ms despite its configured retries, while asynchronous removal with the same options succeeds in 1031–1032 ms. Both observations repeat. Six isolated executions of the first actual policy scenario pass; the CI file holder or permission source remains unidentified.

## Proposal

Use Node asynchronous `rm` for final fixture removal with the existing `recursive: true`, `force: true`, `maxRetries: 10`, and `retryDelay: 100`. Await cleanup through `removeFixtureRoot`, `finishFixture`, `useFixture`, each scenario, and `main`, preserving scenario order. Unlink symbolic links and junctions without traversing their targets. A final cleanup failure remains fatal; when the scenario and cleanup both fail, retain both original errors. Preserve policy violations collected in the existing array.

The [dependency preparation policy](../../implemented/process/2026-09-05-dependency-preparation-policy.md) continues to own preparation, rejection and override semantics. This proposal does not supersede that decision. Implementation is confined to the fixture script, its owning tests, affected dependency-preparation documentation and this Note. It changes no dependency, workflow gate, timeout, package import/linker mode, product behavior or release version.

## Alternatives considered

**Increase synchronous retries.** The controlled Windows probe demonstrates immediate failure despite ten configured retries. Increasing a value that the observed failure does not honor would not establish cleanup completion.

**Ignore final EPERM.** A successful gate would leave owned state behind and hide an unresolved lifecycle failure. Cleanup must complete or report its error.

## Acceptance criteria

A Windows regression uses a real child-held ordinary file: the existing helper fails, and the repaired helper waits for release and removes the directory within the existing budget. A sustained hold still rejects; tests await the holder and verify final cleanup. Portable tests cover awaited success, awaited cleanup after primary failure, final rejection, both-error retention, dangling links and preserved external targets. The complete offline policy fixture passes on Windows with Node 24.19.0 and pnpm 11.7.0 and on the supported local host. Run the focused owning tests, documentation gates, lint, whitespace and normal push typecheck; native Windows static portability CI supplies its full verdict.

## Risks

Every caller must await the cleanup promise before starting the next fixture or exiting. The controlled holder proves a cleanup weakness, not the unidentified CI holder. Repeated policy failures must remain diagnosable instead of being hidden by cleanup. This independent CI fix lands before renewed validation of #629; it supplies no Mobile or Desktop release evidence and needs no product GUI, model call or GIF.
