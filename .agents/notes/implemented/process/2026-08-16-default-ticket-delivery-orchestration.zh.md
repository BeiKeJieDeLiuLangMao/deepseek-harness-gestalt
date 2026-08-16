# Agent Note: 默认 ticket 交付编排

Status: implemented

[English](2026-08-16-default-ticket-delivery-orchestration.md) | 中文

## Problem

一句简短的 ticket 实现请求本身并未说明 coding agent 是否可以创建 worktree、委派任务、提交、推送、创建 PR 或执行合并。每次在提示词中重复这些权限和协调拓扑会增加人工操作，并且不同会话仍可能选择不一致的停止点。

subagent 文本记录也不适合作为持久协调记录。Worker 可以重启，其任务可能丢失上下文，不同宿主或会话对同级通信的支持也可能不同。GitHub 已经保存 ticket 依赖图、评审状态、检查和合并结果。

## Decision

当用户要求实现、修复、继续或落地 issue 或规格时，仓库默认采用[交付编排器](../../../skills/orchestrate-dsh-delivery/SKILL.md)。该请求授权根任务创建隔离的 ticket worktree 和分支、派发 Worker、编辑、提交、推送、创建或更新 PR、响应评审，并在所需证据通过后合并。当前请求中的明确限制覆盖此默认授权。

根任务是唯一协调者和合并者。GitHub Issue、PR、检查和官方 stack 是持久状态。每个就绪 ticket 只有一个可写负责人和一个 worktree；相互独立的 ticket 可以并行。读密集型探索和评审可以使用 subagent，而后续指令和跨 ticket 发现通过根任务传递，并记录到 GitHub 或所属仓库文档中。该流程不依赖同级 agent 通信。

项目 Codex 角色编码两个常用职责：`ticket_worker` 负责一个 ticket 直至形成经过验证的 PR，但不执行合并；`dsh_reviewer` 以只读方式执行规范与规格双轴评审。无法创建任务或 worktree 时，根任务通过顺序执行 ticket Worker 保持相同的所有权模型。

[推送前工作流](../../../skills/dsh-pre-push-checks/SKILL.md)选择对外提交所需证据，[原生 stack 决策](2026-08-02-native-github-stacks-and-optional-rebases.md)负责依赖 PR 的落地。只有实时本地证据、CI、评审和合并要求全部通过后才执行合并。创建 tag、GitHub Release、发布、签名、公证和部署始终需要针对该次发布的明确授权。

## Alternatives considered

**每次请求都要求完整交付提示词。** 这会让权限在每次对话中保持可见，但也要求用户重复稳定的仓库策略，并造成不必要的会话差异。

**所有实现共用一个长期任务。** 这避免创建任务，却会混合无关的可变状态、让上下文无限增长，并削弱 ticket 级恢复能力。

**让 Worker 直接协调。** 同级消息可以减少根任务转发，但会让临时 agent 拓扑成为工作流的一部分，并重复 GitHub 中持久的 ticket 和 PR 状态。

**每个 ticket 都在推送或合并前停止。** 这会最大化逐步确认，却保留了此仓库默认模式旨在消除的人工交接。发布操作会影响已评审 PR 之外的分布式用户和注册表，因此仍保留人工边界。

## Consequences

用户只需提供 ticket 编号或规格引用即可请求实现，并期待工作自动推进到经过验证的合并，无需重复常规 Git 和 GitHub 权限。根任务可以根据 GitHub 状态替换或恢复 Worker，相互独立的 ticket 也可以并行推进，而不共享可写 checkout。

自动合并提高了 ticket 范围、仓库检查和实时评审状态检查的准确性要求。用户的明确限制始终有效；无法提供隔离时，执行方式降级为顺序 Worker；发布工作始终在授权前暂停。
