# Agent Note: Portable pull-request CI recovery boundary

Status: implemented

English | [中文](2026-07-23-portable-required-pull-request-ci.zh.md)

## Problem

Required pull-request jobs assigned to unavailable organization-owned runner labels remain queued even when standard GitHub-hosted jobs execute. A valid workflow cannot satisfy branch protection until every required worker and the `all checks passed` verdict receive a runner.

Billing health, a runner definition, and an advertised autoscaling ceiling do not prove that a named pool can receive a job. Required correctness checks need a portable default that does not depend on repository-external runner provisioning.

## Decision

[CI](../../../../.github/workflows/ci.yml) makes standard GitHub-hosted capacity the ordinary execution path. The three primary Node 24 Linux jobs and `all checks passed` default to `ubuntu-latest`; the independent native Windows job defaults to `windows-2025`. The required Windows job runs Windows Node under Wine on `ubuntu-latest` for the blocking surfaces, while native Windows does not participate in the aggregate ([dual Windows decision](2026-08-08-native-windows-pull-request-ci.md)). Node 22.19, Node 26, the Python SDK unit suite, and the [release-shaped Linux x64 Python runtime validation](../testing/2026-08-12-required-python-runtime-pull-request-ci.md) also use standard hosted capacity.

The three Linux primary jobs, Node compatibility, Python SDK unit suite, Python runtime validation, and `windows node 24 / wine blocking` remain dependencies of `all checks passed`; `windows node 24 / native complete` is deliberately absent. Branch protection continues to require `e2e` and `all checks passed`. Optional self-hosted selectors can retarget the corresponding non-Dependabot workers only when matching runners are registered and online; absent optional capacity does not change the standard defaults.

The [public-repository runner decision](2026-08-18-public-repository-ci-runner-defaults.md) owns the runner labels, failover selectors, and bounded fan-out. The [larger-runner decision](2026-07-22-evidence-based-larger-hosted-runners.md) retains measurements for manual benchmark inventory without expanding the required matrix.

## Alternatives considered

**Put the Linux primary jobs and aggregate on organization larger runners.** Rejected because unavailable labels make branch protection impossible to satisfy. Standard capacity can be slower, but it is available to the personal public repository.

**Select a required pool from advertised core count.** Rejected because benchmarks show non-monotonic scaling and say nothing about whether this repository can allocate the label.

**Skip or demote checks while capacity is unavailable.** This would make the status green by dropping evidence rather than by running the repository's required contracts.

**Use one worker policy on every host.** Outer gate concurrency and inner tool workers contend differently on Linux, Windows, and standard runners; measured host-specific bounds avoid turning additional cores into slower execution.

## Consequences

Ordinary pull requests use standard hosted capacity for the Linux critical path, the required Wine signal, and the independent native Windows signal. A live exact-head run distinguishes the commands branch protection consumes from the separate diagnostic contract; queue delay is reported separately from each job's `startedAt` to `completedAt` execution interval.

The required path remains runnable without organization infrastructure. Enabling a self-hosted variable does not provision a runner; an operator must verify registration, listener health, and workflow access before treating that optional route as recovery capacity.
