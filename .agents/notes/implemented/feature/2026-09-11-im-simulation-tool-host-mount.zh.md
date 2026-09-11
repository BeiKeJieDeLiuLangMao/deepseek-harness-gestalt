# Agent Note: IM 模拟工具 Host 挂载

Status: implemented

[English](2026-09-11-im-simulation-tool-host-mount.md) | 中文

## Problem

模拟工具已存在，测试也手工调用 `registerSimulationTools`，但产品 Host 从未挂载。因此在工作区设置里绑定模拟目标后，该工作区的 Agent 仍拿不到 `im_sim_create` / `im_sim_stop` / 发送工具。

## Decision

`ImSimulationService` 等待 `tools` 与 `agents`，再按 Agent session cwd 映射到已配置模拟目标的工作区，把模拟工具注册到该 Agent 的作用域 `agent.ctx`。`setSimulationConfig` / `deleteSimulationConfig` 发出 `imConfig/simulation-target`，只刷新匹配的 Agent。被测 Agent 工作区和未绑定 session 拿不到模拟工具。模拟出站仍本地结算，绝不 flush 钉钉或旺旺适配器。

## Alternatives considered

**像 `im_send_message` 一样全局注册模拟工具。** 否决：规格把门控在模拟用户工作区；被测 Agent 不能因为成为目标就获得这些工具。

**把 `registerSimulationTools` 留作仅测试钩子。** 否决：GUI 已通过 `imConfig` remotes 持久化模拟目标；Host 必须兑现该绑定。

**经用户 `tool-eligibility` 设置挂载。** 否决：eligibility 是仅允许叠加层；模拟工具必须来自 Host 域状态，而不是 Settings 映射。

## Consequences

已配置模拟目标的模拟用户 Agent 无需模型 round 或真实 IM 消费即可看到模拟工具。清除目标后这些工具消失。真实钉钉登录、真实旺旺读取、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。
