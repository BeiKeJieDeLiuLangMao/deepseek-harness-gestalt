# Agent Note: CI 故障切换手册 — 标准托管 → 可选自托管

Status: implemented

[English](2026-07-26-ci-failover-runbook.md) | 中文

## 问题

这个个人公开仓库没有组织级 `dsh-*` 大规格 runner，因此拉取请求的正确性检查路径不能默认使用这些标签。[CI](../../../../.github/workflows/ci.yml) 中三个必需的 Linux 工作作业（`node 24 / static`、`node 24 / coverage`、`node 24 / snapshots and artifacts`）及其 `all checks passed` 判定作业需要可移植的 GitHub 托管容量；独立的原生 Windows 作业（`windows node 24 / native complete`）也需要同样的属性。标准托管平台发生故障时仍可能导致所有开放的拉取请求都无法合并，因此可选的自托管路线仍有价值，但不能成为仓库先决条件。

## 决策

三个必需的 Linux 工作作业默认使用 `ubuntu-latest`，独立的原生 Windows 作业默认使用 `windows-2025`，判定作业默认使用 `ubuntu-latest`。标准 Linux 路线把门禁、覆盖率、快照、lint 和发布检查的并发上限设为 2；原生 Windows 使用相同上限。手动大规格 runner 基准测试只接受 `workflow_dispatch`，不能参与拉取请求必需检查；只有操作方另行提供其 `dsh-*` 标签后才能运行。

两个仓库变量保留相互独立的可选故障切换路线。`DSH_CI_FAILOVER_LINUX=selfhosted` 把 Linux 工作作业和判定作业发送到 `[self-hosted, linux, x64, vm-backup]`；该共享池中的覆盖率可使用 8 个 worker、快照可使用 12 个 worker，并跳过托管缓存恢复。`DSH_CI_FAILOVER_WINDOWS=selfhosted` 把原生 Windows 作业发送到 `[self-hosted, dsh-win-ci, windows]`。选择器会把 Dependabot 排除在持久化 runner 之外。`serial / linux (self-hosted standby)` 与 `serial / windows (self-hosted standby)` 这两条 master 推送通道会请求这些池；只有可选 runner 已注册且在线时，绿色运行才构成就绪证据。

`ci.yml` 只豁免一个事件不执行 `cancel-in-progress`（`${{ github.event_name != 'push' }}`），因此一次 master 推送不会取消上一次推送仍在运行的自托管演练。每次演练用一个门禁 worker 执行完整且未分片的聚合流程。无条件取消可能会在演练得出结论前将其取代。

这项豁免不保证每次演练都能完成。GitHub 的每个并发组只保留一个待运行条目，因此更新的待运行条目会顶掉更早的条目。该表达式也针对新触发的运行求值，所以在 master 上手动派发与演练同组的运行会取消正在执行的演练。下一次 master 推送可以恢复证据。

这项决定属于工作流级，因为取消作用于整个被取代的运行；作业级并发组无法豁免其中的作业。否定式表达式让 `workflow_dispatch` 运行仍可被取消。手动派发的 runner 基准测试可以请求 12 个另行提供的大规格 runner，最长 15 分钟，但拉取请求无法到达该清单。一次 master 推送只能到达 `wine-apt-cache` 与两条热备定义；`scripts/ci-workflow.spec.ts` 会锁定这个集合。

### 可选自托管池要求

Linux 路线需要标签为 `[self-hosted, linux, x64, vm-backup]` 的 runner。预期的共享镜像会预装 Playwright Chromium 的 Linux 系统软件包；CI 下载锁文件选定的浏览器，但不会在持久化宿主机上运行 `apt`。启用故障切换前，确认最近一次 `serial / linux (self-hosted standby)` 运行完成了包含浏览器的聚合流程。池缺失或离线时，可选路线会持续排队，但不会改变标准托管默认路线。

#### Windows 池

Windows 路线需要标签为 `[self-hosted, dsh-win-ci, windows]` 的 runner。其镜像必须提供 Node 24、pnpm、`PATH` 中带 Git Bash 的 Git、PowerShell 7，并启用开发人员模式以支持符号链接。启用故障切换前，确认最近一次 `serial / windows (self-hosted standby)` 运行完成了 `check:ci:windows-complete`。池缺失或离线时，可选路线会持续排队，但不会改变 `windows-2025` 默认路线。

### 切换步骤（任何具备写权限的协作者，无需合并）

两个开关相互独立；确认对应的可选池在线，并且有权执行即将在其中运行的拉取请求之后，只启用受影响平台的开关。

1. 在仓库 **Settings → Secrets and variables → Actions → Variables** 中，把 `DSH_CI_FAILOVER_LINUX` 或 `DSH_CI_FAILOVER_WINDOWS` 设为 `selfhosted`。
2. 重新触发受影响的作业，使其解析新池。已经排队的作业不会原地重定向；取消卡住的运行并 re-run all jobs，或推送一个新提交。
3. Linux 故障切换状态下，覆盖率使用 8 个 worker，快照使用 12 个 worker，并跳过托管缓存恢复。Windows 开关只改变原生 Windows runner 池。

**Dependabot 例外。**两个选择器都排除 `dependabot[bot]`，因此即使自托管开关处于启用状态，由依赖项提供的代码仍留在 GitHub 标准托管 runner 上。在标准托管平台故障期间，Dependabot 拉取请求可能持续排队；绝不能通过把它路由到持久化 runner 来绕过故障。

**谁能扳动变量。**GitHub 允许具有写权限的协作者管理仓库变量。启用开关会授权非 Dependabot 拉取请求的 merge ref 在选定的持久化池上执行，因此响应者必须在启用前检查 runner group 的仓库与工作流访问权限。

## 故障切换期间的容量

容量由提供可选池的操作方负责。Linux 工作流把单个 runner 实例限制为 8 个覆盖率 worker 与 12 个快照 worker；队列增长时应增加已注册实例，而不是提高这些单 runner 上限。每个新增 runner 都需要不同的 GitHub 身份和正在运行的监听器。Windows 工作流在两条路线中都把覆盖率、门禁与发布检查并发限制为 2。

### 切回

删除受影响的故障切换变量，或将其设为 `selfhosted` 以外的任何值，然后触发一次新运行。Linux 作业会解析为 `ubuntu-latest`；原生 Windows 作业会解析为 `windows-2025`。按照池操作方的流程删除临时 runner 实例。

### 信任边界

拉取请求无法设置仓库变量，但它的 merge ref 会提供自托管故障切换运行所执行的工作流定义。选择器会阻止 Dependabot 进入持久化 runner；开关启用时，其他拉取请求仍符合条件。因此，runner group 访问策略与响应者对来源的审查共同保护可选池。保持两个变量均未设置，即可让所有拉取请求代码留在 GitHub 托管 runner 上，且不依赖仓库外部基础设施。

## 曾考虑的替代方案

**默认使用组织级大规格 runner 标签。**拒绝采用，因为个人公开仓库无法使用这些标签。必需的正确性检查路径必须无需组织外部配置即可获得 runner；大规格 runner 引用只保留为手动基准测试清单。

**故障期间合并工作流变更。**拒绝采用，因为不可用的必需检查可能阻止该恢复变更合并。仓库变量可以重定向新运行，而无需更改默认分支。

**把自托管池放在默认必需路径中。**拒绝采用，因为这会用仓库外部先决条件替代 GitHub 托管可用性，并使每个符合条件的拉取请求接触持久化基础设施。显式、按平台拆分的开关让这项取舍保持临时且可见。

## 后果

每个拉取请求都能在这个个人公开仓库可用的 GitHub 标准托管 runner 上进入必需的 Linux 与原生 Windows 产品检查。较小的 runner 用吞吐量换取可移植性，因此工作流默认把 runner 内部 fan-out 上限设为 2。可选的自托管恢复为每个平台保留第二套拓扑及其安全审查、配置、热备证据和变量操作；Dependabot 永远不会进入该拓扑。手动大规格 runner 基准测试保持非必需状态，直到对应标签被明确提供后才可运行。
