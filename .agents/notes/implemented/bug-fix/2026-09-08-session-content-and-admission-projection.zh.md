# Agent Note：Session 内容与准入投影

Status: implemented

[English](2026-09-08-session-content-and-admission-projection.md) | 中文

## 问题

打开持久化历史不会激活 parent Agent。Side Chat 可以通过自己的准入 adapter 冷恢复续接，但通用 subagent 编辑器会因 parent 未存活而阻止它。另一个问题是 Member Question 已带来 Decision Brief，却没有模型轮次；只按轮次判断空白会隐藏已需人工处理的 Session。

## 决策

Session Controller 投影实际选择的提交分派方：已注册功能准入优先，其次由保留的 subagent 地址选择子代理投递，普通 Session 则使用 Session 投递。注册与撤销即使在历史尚未打开时也会刷新该值。续接编辑器服从功能 owner，不改变真实 parent 可用性或 subagent 地址。one-shot 历史、没有 owner 的离线续接与独立 Stop 保留现有规则。Host 继续负责授权和权限检查。

Session 列表元数据在轮次开始或收到 Member Question 时变为非空。纯配置事件仍为空白，收到简报不会创建合成轮次。元数据状态版本 2 使旧 checkpoint 失效，由普通投影恢复路径重新折叠日志。

## 验证

准入、编辑器与 InputBar 测试覆盖 parent 冷态下的功能提交、真实 parent 可用性、one-shot 行为和撤销。无密钥 Web 组装关闭 Host，恢复持久状态，打开原 child，从 parent 冷态的基线通过 child 自身模型续接。接收 Loader 测试验证零轮次的可见元数据，以及版本 1 checkpoint 的重新折叠。

## 考虑过的替代方案

**选中 child 时恢复 parent，或报告 parent 可用。** 这会改变被动历史导航并伪造 catalog 的 live Agent 事实，而不是服从 child 现有准入 owner。

**显示所有空白 Session，或为收到的问题合成模型轮次。** 这会暴露空草稿或破坏已收简报的生命周期。由事件推导的内容标记已经足够。

## 影响

消费方区分历史可用性、parent 存活状态、提交归属与有意义的接收内容。这些投影本身都不授予准入路由或 Host 权限。
