# Agent Note: CI failover runbook — standard hosted → optional self-hosted

Status: implemented

English | [中文](2026-07-26-ci-failover-runbook.zh.md)

## Problem

The personal public repository has no organization-level `dsh-*` larger runners, so pull-request correctness paths cannot use those labels by default. The three required Linux workers in [CI](../../../../.github/workflows/ci.yml) (`node 24 / static`, `node 24 / coverage`, `node 24 / snapshots and artifacts`) and their `all checks passed` verdict need portable GitHub-hosted capacity; the independent native Windows job (`windows node 24 / native complete`) needs the same property. A standard hosted-platform outage can still leave every open pull request unmergeable, so optional self-hosted routes remain useful without becoming repository prerequisites.

## Decision

The three required Linux workers default to `ubuntu-latest`, the independent native Windows job defaults to `windows-2025`, and the verdict defaults to `ubuntu-latest`. The standard Linux route bounds gate, coverage, snapshot, lint, and publication concurrency at two; native Windows uses the same bound. Manual larger-runner benchmarks remain `workflow_dispatch`-only and cannot participate in pull-request required checks; they run only when an operator separately provisions their `dsh-*` labels.

Two repository variables preserve independent optional failover routes. `DSH_CI_FAILOVER_LINUX=selfhosted` sends the Linux workers and verdict to `[self-hosted, linux, x64, vm-backup]`; coverage may use eight workers and snapshots twelve on that shared pool, and hosted cache restores are skipped. `DSH_CI_FAILOVER_WINDOWS=selfhosted` sends the native Windows job to `[self-hosted, dsh-win-ci, windows]`. The selectors exclude Dependabot from persistent runners. The `serial / linux (self-hosted standby)` and `serial / windows (self-hosted standby)` master-push lanes request those pools; a green run is readiness evidence only when the optional runners are registered and online.

`ci.yml` exempts exactly one event from `cancel-in-progress` (`${{ github.event_name != 'push' }}`), so one master push does not cancel a self-hosted drill still running from the previous one. Each drill runs its complete unsharded aggregate with one gate worker. Unconditional cancellation can supersede a drill before it reaches a verdict.

The exemption does not guarantee that every drill finishes. GitHub keeps one pending entry per concurrency group, so a newer pending run displaces an older one. The expression is also evaluated against the newly triggered run, so a manual dispatch on master cancels a running drill in the same group. The next master push can restore the evidence.

The decision belongs at workflow level because cancellation applies to the whole superseded run; a job-level concurrency group cannot exempt its job. The negated expression keeps `workflow_dispatch` runs cancellable. A manually dispatched runner benchmark can request twelve separately provisioned larger runners for up to fifteen minutes, but that inventory is unreachable from pull requests. A master push reaches only `wine-apt-cache` and the two standby definitions; `scripts/ci-workflow.spec.ts` pins that set.

### Optional self-hosted pool requirements

The Linux route requires runners labeled `[self-hosted, linux, x64, vm-backup]`. The intended shared image preinstalls Playwright Chromium's Linux system packages; CI downloads the lockfile-selected browser without running `apt` on the persistent host. Before activating failover, check that the latest `serial / linux (self-hosted standby)` run completed the browser-inclusive aggregate. An absent or offline pool leaves the optional route queued and does not change the standard hosted default.

#### Windows pool

The Windows route requires runners labeled `[self-hosted, dsh-win-ci, windows]`. Their image must provide Node 24, pnpm, Git with Git Bash on `PATH`, PowerShell 7, and Developer Mode for symlink support. Before activating failover, check that the latest `serial / windows (self-hosted standby)` run completed `check:ci:windows-complete`. An absent or offline pool leaves the optional route queued and does not change the `windows-2025` default.

### Switch (any repository writer, no merge)

The two switches are independent; activate only the affected platform after confirming that its optional pool is online and authorized for the pull requests that will run there.

1. In repository **Settings → Secrets and variables → Actions → Variables**, set `DSH_CI_FAILOVER_LINUX` or `DSH_CI_FAILOVER_WINDOWS` to `selfhosted`.
2. Retrigger the affected jobs so they resolve the new pool. Queued jobs do not retarget in place; cancel the stuck run and re-run all jobs, or push a new commit.
3. Under Linux failover, coverage uses eight workers, snapshots use twelve, and hosted cache restores are skipped. The Windows switch changes only the native Windows runner pool.

**Dependabot exception.** Both selectors exclude `dependabot[bot]`, so dependency-supplied code stays on standard GitHub-hosted runners even while a self-hosted switch is active. A Dependabot pull request may remain queued during a standard hosted-platform outage; it must never be routed to a persistent runner as a workaround.

**Who can flip the variable.** GitHub allows collaborators with write access to manage repository variables. Activating a switch authorizes non-Dependabot pull-request merge refs to execute on the selected persistent pool, so the responder must verify the runner group's repository and workflow access before activation.

## Capacity during failover

Capacity belongs to the operator who provisions the optional pool. The Linux workflow bounds one runner instance at eight coverage workers and twelve snapshot workers; add registered instances rather than raising those per-runner limits when queues build. Every additional runner needs a distinct GitHub identity and a running listener. The Windows workflow keeps coverage, gate, and publication concurrency at two on both routes.

### Switch back

Delete the affected failover variable or set it to anything other than `selfhosted`, then trigger a new run. Linux jobs resolve to `ubuntu-latest`; the native Windows job resolves to `windows-2025`. Remove temporary runner instances according to the pool operator's procedure.

### Trust boundary

A pull request cannot set repository variables, but its merge ref supplies the workflow definition executed by a self-hosted failover run. The selectors keep Dependabot off persistent runners; other pull requests remain eligible when a switch is active. Runner-group access policy and the responder's source review therefore protect the optional pool. Leaving both variables unset keeps all pull-request code on GitHub-hosted runners and requires no repository-external infrastructure.

## Alternatives considered

**Use organization larger-runner labels by default.** Rejected because those labels are not available to the personal public repository. A required correctness path must receive a runner without external organization configuration; larger-runner references remain manual benchmark inventory only.

**Merge a workflow change during an outage.** Rejected because unavailable required checks can prevent that recovery change from merging. Repository variables can retarget a new run without changing the default branch.

**Keep a self-hosted pool in the default required path.** Rejected because it replaces GitHub-hosted availability with a repository-external prerequisite and exposes persistent infrastructure to every eligible pull request. Explicit, platform-specific switches keep that trade-off temporary and visible.

## Consequences

Every pull request can reach the required Linux and native Windows product checks on standard GitHub-hosted runners available to the personal public repository. Smaller runners trade throughput for portability, so the workflow caps in-runner fan-out at two by default. Optional self-hosted recovery retains a second topology per platform, including its security review, provisioning, standby evidence, and variable operations; Dependabot never enters that topology. Manual larger-runner benchmarks remain non-required and unavailable until their labels are explicitly provisioned.
