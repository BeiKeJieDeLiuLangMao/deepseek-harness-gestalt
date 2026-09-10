# Agent Note: IM simulation transport and workspace tool gating

Status: implemented

[English](2026-09-10-im-simulation-transport.md) | 中文

## Problem

账号接管需要一条本地模拟路径：入站记录、历史查询和 `im_send_message` 与真实钉钉、旺旺相同，但不能任意寻址账号，也不能把测试消息发到真实联系人。模拟用户工作区必须先选定一个已配置的接管目标，模拟工具才出现。每个实例必须冻结创建时的目标，隔离并发会话，把显式停止视为终态，把 JSONL 只当作可查询背景，并且账号暂停不得阻断模拟投递。

## Decision

`ImSimulationService` 挂载于 `ctx.imSimulation`，入口为 `@deepseek-ai/dsh-im-core/simulation`。`registerSimulationTools(ctx, workspaceId)` 仅在 `imConfig.getSimulationConfig` 返回目标后注册 `im_sim_create`、`im_sim_stop`、`im_sim_send_as_member` 和 `im_sim_send_as_managed_human`；未配置工作区得到空 disposer。`createInstance` 快照账号、会话类型、会话 ID 以及匹配路由的被测工作区。之后的 `setSimulationConfig` 不得改写该快照。成员注入使用 `external`；托管账号真人注入使用 `human_dsh`。JSONL 导入写入入站记录后立即 `markSubmitted`，因此 `admitInbound` 不会 steer。`im_send_message` 在 `sim:` 作用域要求实例正在运行，经 `handleSimOutbound` 本地结算，并把 `ai_outbound` 回显到同一作用域。绝不调用钉钉或旺旺适配器。已停止或缺失的实例拒绝发送、注入、同 ID 重建和准入。

## Alternatives considered

**在 `im_send_message` 旁增加模拟专用回复工具。** 否决：配置可能在模拟中通过、在真实出站路径失败。被测 agent 保持同一出站工具；实例上下文选择模拟通道。

**工作区模拟配置变更时改写运行中实例的目标。** 否决：进行中的测试会静默改向另一个账号或会话。

**模拟出站继续保持 pending，留给后续 transport 票据。** 否决：T6 负责本地双向投递；pending 会把未落地的模拟发送伪装成成功。

## Consequences

模拟工具仍受已配置目标门控。并发实例不共享历史。停止后不可恢复。JSONL 只作为背景查询数据。账号暂停仍允许模拟注入与本地出站结算。真实适配器在模拟路径上保持未调用。

`packages/im/im-core/tests/simulation/transport.spec.ts` 覆盖工具缺席、目标冻结、隔离、停止、JSONL 不触发、不调用适配器、暂停与发送者分类。现有无密钥 Loader 组合测试同时要求 `ctx.get('imSimulation')`。
