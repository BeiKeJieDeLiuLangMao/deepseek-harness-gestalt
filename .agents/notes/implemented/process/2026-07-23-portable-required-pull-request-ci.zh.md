# Agent Note: 拉取请求 CI 的可移植恢复边界

Status: implemented

[English](2026-07-23-portable-required-pull-request-ci.md) | 中文

## 问题

分配到不可用组织自有 runner 标签的拉取请求必需作业，即使 GitHub 标准托管作业能够执行，也会持续排队。有效的工作流只有在每个必需 worker 和 `all checks passed` 判定作业都获得 runner 后，才能满足分支保护。

账单状态正常、存在 runner 定义以及公布了较大的自动扩缩容上限，都不能证明指定的 runner 池可以接收作业。必需的正确性检查需要一个不依赖仓库外部 runner 配置的可移植默认路线。

## 决策

[CI](../../../../.github/workflows/ci.yml) 把 GitHub 标准托管容量作为普通执行路径。三个主要 Node 24 Linux 作业与 `all checks passed` 默认使用 `ubuntu-latest`；独立的原生 Windows 作业默认使用 `windows-2025`。必需的 Windows 作业在 `ubuntu-latest` 上通过 Wine 运行 Windows Node，覆盖阻断性检查范围，而原生 Windows 不参与聚合流程（[双 Windows 决策](2026-08-08-native-windows-pull-request-ci.md)）。Node 22.19、Node 26、Python SDK 单元测试套件与[发布形态的 Linux x64 Python 运行时验证](../testing/2026-08-12-required-python-runtime-pull-request-ci.md)也使用标准托管容量。

三项 Linux 主作业、Node 兼容性、Python SDK 单元测试套件、Python 运行时验证和 `windows node 24 / wine blocking` 继续作为 `all checks passed` 的依赖项；`windows node 24 / native complete` 被刻意排除。分支保护继续要求 `e2e` 和 `all checks passed`。只有匹配的 runner 已注册并在线时，可选自托管选择器才会重定向对应的同仓库、非 Dependabot worker；外部 fork 的拉取请求继续使用托管 runner，可选容量缺失不会改变标准默认值。

[公开仓库 runner 决策](2026-08-18-public-repository-ci-runner-defaults.md)拥有 runner 标签、故障切换选择器与有界 fan-out。[大规格 runner 决策](2026-07-22-evidence-based-larger-hosted-runners.md)保留手动基准测试清单的测量结果，但不会扩大必需矩阵。

## 曾考虑的替代方案

**把 Linux 主作业和聚合流程放到组织级大规格 runner 上。**拒绝采用，因为不可用标签会使分支保护无法满足。标准容量可能更慢，但这个个人公开仓库可以使用。

**根据标称核心数选择必需池。**拒绝采用，因为基准测试显示扩展并非单调，也无法说明本仓库是否能够分配相应标签。

**在容量不可用时跳过检查或降低其级别。** 这种方式通过丢弃证据而非执行仓库的必需约定来使状态变绿。

**在每台主机上使用同一工作线程策略。** 外层门禁并发与内层工具工作线程在 Linux、Windows 和标准运行器上的争用方式不同；按主机实测的上限可以避免新增核心反而拖慢执行。

## 后果

普通拉取请求对 Linux 关键路径、必需 Wine 信号和独立的原生 Windows 信号都使用标准托管容量。一次针对确切分支头的实际运行会区分分支保护采用的命令与单独的诊断约定；排队延迟与每个作业从 `startedAt` 到 `completedAt` 的执行区间分开报告。

必需路径无需组织基础设施即可运行。启用自托管变量不会配置 runner；操作方必须先验证注册状态、监听器健康度和工作流访问权限，才能把该可选路线视为恢复容量。
