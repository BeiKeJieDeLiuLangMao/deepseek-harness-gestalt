# Agent Note: Public-repository CI runner defaults

Status: implemented

English | [中文](2026-08-18-public-repository-ci-runner-defaults.zh.md)

## Problem

Required pull-request jobs cannot depend on runner labels unavailable to this personal public repository. Organization-level `dsh-*` labels left the three primary Linux jobs and the independent native Windows job queued without a runner, even though standard GitHub-hosted jobs executed. A runner definition, benchmark result, or self-hosted standby job does not prove that the corresponding capacity is registered and online for this repository.

## Decision

The three required Linux workers and `all checks passed` verdict in [CI](../../../../.github/workflows/ci.yml) default to `ubuntu-latest`. The independent `windows-native` worker defaults to `windows-2025`; the required `windows` worker remains the Wine lane on `ubuntu-latest`. Standard-runner gate, coverage, snapshot, lint, publication, and native Windows fan-out is bounded at two. Manual larger-runner jobs remain reachable only through `workflow_dispatch`, so their `dsh-*` labels cannot affect pull-request checks.

Two independent repository variables retain optional self-hosted routes. `DSH_CI_FAILOVER_LINUX=selfhosted` retargets only the three Linux workers and their verdict to `[self-hosted, linux, x64, vm-backup]`. `DSH_CI_FAILOVER_WINDOWS=selfhosted` retargets only `windows-native` to `[self-hosted, dsh-win-ci, windows]`; it never retargets the required Wine lane. Each selector requires a non-Dependabot actor and a pull-request head repository equal to `github.repository` before choosing persistent infrastructure. Dependabot and pull requests from external forks therefore remain on the standard hosted default for every switch state.

Setting a variable selects labels; it does not create capacity. The optional route runs only when matching runners are registered, online, and authorized for the workflow. The master-push `serial / linux (self-hosted standby)` and `serial / windows (self-hosted standby)` definitions can provide readiness evidence when those runners exist, but a queued or absent run proves nothing. The Linux route permits eight coverage workers and twelve snapshot workers per provisioned runner; its cache restores are skipped. The Windows route keeps coverage, gate, and publication concurrency at two.

Workflow-level cancellation exempts push runs so an available standby can finish its long aggregate instead of being superseded by the next master update. This does not guarantee a result from an absent runner, and a newer pending push may still replace an older pending run. A manual dispatch remains cancellable. The workflow contract test pins the push-reachable job set and the complete failover selectors, including same-repository maintainer, external-fork contributor, and Dependabot behavior for unset and self-hosted switch states.

The [archived failover runbook](../../archived/process/2026-07-26-ci-failover-runbook.md) records the earlier organization and in-house topology. The [larger-runner measurements](2026-07-22-evidence-based-larger-hosted-runners.md) remain useful only for manually provisioned benchmark capacity. The [portable required-CI](2026-07-23-portable-required-pull-request-ci.md) and [dual Windows](2026-08-08-native-windows-pull-request-ci.md) decisions retain their aggregate and platform-coverage responsibilities under these defaults.

## Alternatives considered

**Use organization larger-runner labels by default.** Rejected because those labels are not available to the personal repository. A correctness path must receive a runner without organization infrastructure.

**Use self-hosted runners by default.** Rejected because registration, listener health, access policy, and persistent-host security would become pull-request prerequisites. Explicit variables make that operational trade temporary and platform-specific, while the same-repository guard keeps untrusted fork code off persistent hosts.

**Remove the self-hosted selectors and standby definitions.** Rejected because an operator may provision the exact labels during a hosted-platform outage. Keeping the route optional preserves recovery without weakening the default.

**Use the moving `windows-latest` alias.** Rejected because the native inventory targets the explicit Windows 2025 image. `windows-2025` remains a standard GitHub-hosted label while avoiding an unreviewed OS-generation change.

## Consequences

Every pull request can allocate its required Linux workers and independent native Windows worker using capacity available to the public repository. Smaller hosted machines may take longer, but bounded fan-out avoids retaining larger-runner pressure on the default path. Optional self-hosted jobs may queue indefinitely when their labels are absent; that state does not block the hosted default and must not be reported as standby readiness. Larger-runner benchmarks remain manual and have no pull-request or branch-protection effect.
