# Agent Note: 个人公开仓库的 CI runner 默认值

Status: implemented

[English](2026-08-18-public-repository-ci-runner-defaults.md) | 中文

## 问题

拉取请求的必需作业不能依赖这个个人公开仓库无法使用的 runner 标签。组织级 `dsh-*` 标签使三个主要 Linux 作业和独立的原生 Windows 作业持续排队且没有 runner，而 GitHub 标准托管作业可以执行。runner 定义、基准测试结果或自托管热备作业都不能证明对应容量已经为本仓库注册并在线。

## 决策

[CI](../../../../.github/workflows/ci.yml) 中三个必需的 Linux worker 与 `all checks passed` 判定作业默认使用 `ubuntu-latest`。独立的 `windows-native` worker 默认使用 `windows-2025`；必需的 `windows` worker 仍是 `ubuntu-latest` 上的 Wine 通道。标准 runner 上的门禁、覆盖率、快照、lint、发布检查与原生 Windows fan-out 上限均为 2。大规格 runner 作业只能通过 `workflow_dispatch` 手动到达，因此其中的 `dsh-*` 标签不会影响拉取请求检查。

两个相互独立的仓库变量保留可选的自托管路线。`DSH_CI_FAILOVER_LINUX=selfhosted` 只把三个 Linux worker 及其判定作业重定向到 `[self-hosted, linux, x64, vm-backup]`。`DSH_CI_FAILOVER_WINDOWS=selfhosted` 只把 `windows-native` 重定向到 `[self-hosted, dsh-win-ci, windows]`，绝不会重定向必需的 Wine 通道。每个选择器只有在拉取请求不是 Dependabot 时才选择持久化基础设施。因此在任何开关状态下，Dependabot 都保留在标准托管默认路线。

设置变量只会选择标签，不会创建容量。只有匹配的 runner 已注册、在线且获准运行该工作流时，可选路线才会执行。master 推送下的 `serial / linux (self-hosted standby)` 与 `serial / windows (self-hosted standby)` 定义可以在这些 runner 存在时提供就绪证据，但持续排队或没有运行不能证明任何事情。Linux 路线允许每个已配置 runner 使用 8 个覆盖率 worker 与 12 个快照 worker，并跳过缓存恢复。Windows 路线把覆盖率、门禁与发布检查并发保持为 2。

工作流级取消策略会豁免 push 运行，使可用的热备能够完成耗时较长的聚合流程，而不会被下一次 master 更新取代。这不会保证缺失的 runner 能产出结果，更新的待运行 push 仍可能替换更早的待运行项。手动派发仍可取消。工作流约定测试会锁定 push 可达作业集合与完整的故障切换选择器，包括普通用户和 Dependabot 在未设置开关与启用自托管两种状态下的行为。

[已归档的故障切换手册](../../archived/process/2026-07-26-ci-failover-runbook.md)记录先前的组织与公司自有拓扑。[大规格 runner 测量结果](2026-07-22-evidence-based-larger-hosted-runners.md)只对手动配置的基准容量仍有价值。[可移植必需 CI](2026-07-23-portable-required-pull-request-ci.md)与[双 Windows](2026-08-08-native-windows-pull-request-ci.md)决策在这些默认值下继续拥有聚合判定和平台覆盖职责。

## 曾考虑的替代方案

**默认使用组织级大规格 runner 标签。**拒绝采用，因为个人仓库无法使用这些标签。正确性检查路径必须无需组织基础设施即可获得 runner。

**默认使用自托管 runner。**拒绝采用，因为注册状态、监听器健康度、访问策略与持久化宿主机安全会成为拉取请求的先决条件。显式变量使这项运维取舍保持临时且按平台隔离。

**删除自托管选择器与热备定义。**拒绝采用，因为操作方可能在托管平台故障时配置这些精确标签。保留可选路线可以维持恢复能力，而不削弱默认路线。

**使用会移动的 `windows-latest` 别名。**拒绝采用，因为原生检查清单面向明确的 Windows 2025 镜像。`windows-2025` 仍是 GitHub 标准托管标签，同时避免未经评审的操作系统代际变更。

## 后果

每个拉取请求都能使用这个公开仓库可获得的容量来分配必需的 Linux worker 与独立的原生 Windows worker。较小的托管机器可能耗时更长，但有界 fan-out 不会把大规格 runner 压力带入默认路径。可选自托管作业在标签缺失时可能无限排队；该状态不会阻塞托管默认路线，也不能报告为热备就绪。大规格 runner 基准测试保持手动触发，不影响拉取请求或分支保护。
