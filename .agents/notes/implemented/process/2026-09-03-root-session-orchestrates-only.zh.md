# Agent Note: 根会话只做编排

Status: implemented

[English](2026-09-03-root-session-orchestrates-only.md) | 中文

## 问题

项目尾声的用户反馈、CI 失败和少量后续修改可能落在票 writer 循环之外。协调会话随后可能自行实现修复，或为每个后续动作新建 writer。前者混合分析与实现，后者丢弃有用上下文，并在职责不变时持续增加执行器状态。

## 决策

[交付编排器](../../../skills/orchestrate-dsh-delivery/SKILL.md)把根会话留在分析、拆解、派发和验收。它澄清请求、维护交付台账、拆分工作、选择执行器和模型、等待，并判断报告的证据。它不实现。

实现包括：为了改动而阅读大面积代码、编写或编辑产品或文档文件、跑本地测试或其他可执行证据，以及批量修改。根会话通过运行时的 Agent 工具（`subagent`、`subagent_fork` 或 Codex worktree 任务）把这类工作派给该票的责任 owner。交付仍活跃时，用户反馈、CI 失败、review finding 和验收修复都回到该 owner。只有独立交付单元、必要的独立性或模型能力、owner 不可用或上下文明显陈旧，或早期交付关闭后的独立请求，才新建 writer；台账在其写入前记录替换关系和交接。

根会话可以运行有界的只读状态与来源查询，检查精确 Git ref、worktree、GitHub、跟踪器、worker 报告、产物和 CI；更新交付台账；写 brief；创建空的规格分支和 Draft pull request；并在报告的证据通过后入队合并。这些查询只检查协调状态，不能替代 writer 负责的产品测试或其他可执行验收证据。根会话不在协调 checkout 里落地代码、文档或环境改动，也不启动后台原生验收实例或走体验路线。[规格 PR 决策](2026-09-02-spec-pr-delivery-and-retro.zh.md)仍然拥有 pull request 数量、merger 子代理、scratch 笔记和 retro 闸门。[还原度与验收路线决策](2026-09-03-ui-fidelity-and-acceptance-route.zh.md)拥有稿对照和专用验收会话。[按运行时选择执行器](2026-08-27-runtime-specific-delivery-executors.zh.md)仍然选择 Codex 或 DSH worker；顺序派发是顺序的隔离 writer，而不是根会话自己写。

当没有任何 Agent 工具能跑 writer 时，根会话报告该隔离失败并停止。它不退回在协调会话里实现。

## 曾考虑的替代方案

**让根会话就地修复尾声反馈。** 一行后续在协调上下文里更快。它也会把分析窗口花在代码上，没有可恢复的隔离 worktree，并训练根会话把「很小」当作可以实现的许可。

**在 Codex 任务或 worktree 不可用时，让根会话充当顺序 writer。** 这能在降级执行器下继续推进。它正是本决策禁止的协调会话实现。缺少 writer 工具是要报告的阻塞。

**允许根会话把接受的 retro 改动落到规划 checkout。** 这些文件是环境转向，不是产品代码。它们仍是协调会话里的实现；由 writer 把它们落到规格分支。

**每个后续阶段都新建 writer。** 这样每份 brief 都很小，但会丢失 review 与验收修复需要的实现和失败上下文。一个 owner 持续负责到交付单元关闭，或由记录在案的替代者接管。

## 后果

根上下文留在交付图上，包括最后一张票之后的反馈。每一次代码、测试和文档改动都有可恢复的 owner；根会话无需为每次状态查询单独派发，就能核实协调事实。复用保留票上下文，并让替换关系明确。少量实现后续仍要付出 brief 和等待成本。缺少 Agent 工具会停止交付，而不是在根会话里静默实现。
