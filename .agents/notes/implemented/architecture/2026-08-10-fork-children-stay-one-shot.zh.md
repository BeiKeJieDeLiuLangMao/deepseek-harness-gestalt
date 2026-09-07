# Agent Note: fork child 生命周期由组合决定

Status: implemented

[English](2026-08-10-fork-children-stay-one-shot.md) | 中文

## 问题

fork 与 spawn 的唯一区别是 child Session 以 parent 已完成轮次的前缀作为 seed（见 [subagent-fork-in-process](../../../../packages/subagent/subagent-fork-in-process/README.zh.md)）。这份 seed 会产生真实 token 成本，因为每次 child 请求都会重新发送继承历史。它的具体收益是提供方侧的前缀复用：使用相同提供方与模型时，child 请求的前导字节若与 parent 相同，就不必再次预填共享区段。child scope 在继承历史之前加入的任何内容都会消耗这项收益，因为复用会在第一个不同字节处停止。

按方向划分的 child 消息机制曾在继承轮次之前加入 child 专属工具 schema 与系统提示词 section。[相邻 Agent 消息决策](2026-08-27-adjacent-agent-steer-messaging.zh.md)移除了这些请求头差异：parent 与可继续 child 现在继承定义与顺序相同的 `send_message`，child 的 parent id 与返回指导则位于 fork 前缀之后的初始 user 任务中。因此，前缀复用与生命周期选择是两项互不依赖的组合决策。

## 决策

[base bundle](../../../../packages/bundle/base/cordis.patch.yml)把 fork 委派工具绑定为 `backgroundMode: one-shot`。standard、PTC 与 Cordis agent preset 会把该配置项覆盖为 `continuable`。两种模式都会保留继承的请求前缀，因为它们的请求头工具定义与顺序都和 parent 相同。

前台与后台的一次性 child 都通过 `SubagentRuntime.start()` 创建，在 dispose 前返回一个结果。可继续 child 通过 `SubagentRuntime.startContinuable()` 创建；`ForkInProcessProvider.prepareContinuable` 只捕获一次前缀，因为它会成为 child 的持久 transcript，调用方则会收到一个稳定的 child id，用于后续相邻 Agent 消息与中断。

base 组合中的 spawn 仍为 `continuable`。spawn child 没有可供复用的继承 transcript，因此其生命周期选择不带前缀复用条件。

### 选择由组合而非提供方代码决定

`ForkInProcessProvider` 同时实现 `start` 与 `prepareContinuable`，`tool-subagent` 通过 `backgroundMode` 选择其一。只有所选提供方没有暴露 `prepareContinuable` 时，可继续选择才会显式失败；fork 提供方暴露了该能力。因此，由 bundle 与 preset 配置项决定一次调用返回结果还是持久 id。

部署可以通过 bundle 或 profile patch 覆盖任一种选择。提供方显式保留 persona、tool filter、输出、深度与模型路由能力，因此调用方选择的差异仍会作为可能的前缀差异公开。

## 考虑过的替代方案

**挂载时拒绝 `inheritsParentContext` + `continuable`。** 不采用，因为统一的消息定义与位于前缀之后的返回指导让这种组合有效。提供方若拒绝它，就会拒绝一种既能执行又不会损失继承请求前缀的组合。

**停止挂载 fork 提供方。** 不采用，因为两种生命周期模式都保留 seed context 能力，前台的一次性 fork 仍会返回直接结果。

**强制所有随附 fork 使用 one-shot。** 不采用，因为 standard、PTC 与 Cordis preset 有意公开持久化的相邻 Agent 协作。它们的可继续 fork 与 parent 保持相同前缀。

**恢复 child 专属 report 工具。** [相邻 Agent 消息](2026-08-27-adjacent-agent-steer-messaging.zh.md)已否决该方案：独立 schema 与提示词会重复同一个操作，并使 parent 与 child 的请求头不同。

**把动态 parent 指导放进请求头。** 不采用，因为 parent id 随 Activation 变化。初始 user 任务可以在继承历史之后携带该信息，而不改变可复用前缀。

## 后果

- 直接由 base bundle 创建的 fork 是 one-shot；standard、PTC 与 Cordis preset 创建可继续 fork。
- 除非部署选择不同的 persona、tool filter 或模型路由，否则 fork child 可复用的请求前缀与 parent 相同。
- 一次性 fork 把结果返回给调用方轮次。可继续 fork 返回持久 id，并接受相邻 `send_message` 与 interrupt 操作。
- 由 manager 负责的结算通知与模型编写的 child 消息保持分离，并覆盖 child 无法配合时的终态结果。

### 已接受风险

生命周期是一项配置选择。自定义层可以在 one-shot 与 continuable 之间切换 fork 工具，也可以加入降低前缀复用率的 child 专属请求头贡献。提供方报告所选生命周期并应用请求的差异，部署则负责其 token 成本取舍。
