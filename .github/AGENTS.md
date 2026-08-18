# AGENTS.md — GitHub Actions

In this personal public repository, required pull-request Linux jobs default to `ubuntu-latest`, and their worker and gate concurrency must fit that standard runner. `DSH_CI_FAILOVER_LINUX=selfhosted` may route only the corresponding non-Dependabot Linux workers and verdict to the optional `[self-hosted, linux, x64, vm-backup]` pool when matching runners are registered and online; see the [runner-default decision](../.agents/notes/implemented/process/2026-08-18-public-repository-ci-runner-defaults.md).

Run jobs on Windows runners (`windows-*` labels) under native `pwsh`. The required pull-request `windows` job is the deliberate exception: it runs Windows Node under Wine on hosted Linux; `windows-native` defaults to `windows-2025` and reports independently, while `DSH_CI_FAILOVER_WINDOWS=selfhosted` may route only that non-Dependabot native worker to registered, online `[self-hosted, dsh-win-ci, windows]` runners.
