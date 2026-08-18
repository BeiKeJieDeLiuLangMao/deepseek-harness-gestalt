# AGENTS.md — GitHub Actions

In this personal public repository, required pull-request Linux jobs default to `ubuntu-latest`, and their worker and gate concurrency must fit that standard runner. `DSH_CI_FAILOVER_LINUX=selfhosted` may route non-Dependabot pull requests to the optional `[self-hosted, linux, x64, vm-backup]` pool; see the [failover runbook](../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md).

Run jobs on Windows runners (`windows-*` labels) under native `pwsh`. The required pull-request `windows` job is the deliberate exception: it runs Windows Node under Wine on hosted Linux; `windows-native` defaults to `windows-2025` and reports independently, while `DSH_CI_FAILOVER_WINDOWS=selfhosted` may route non-Dependabot pull requests to `[self-hosted, dsh-win-ci, windows]`.
