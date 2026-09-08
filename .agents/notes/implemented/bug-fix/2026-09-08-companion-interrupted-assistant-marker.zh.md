# Agent Note: Companion 保留持久 assistant 中断标记

Status: implemented

[English](2026-09-08-companion-interrupted-assistant-marker.md) | 中文

## Problem

取消 assistant 响应后，Session 会保留已经输出的前缀；但 Desktop 如果在 assistant Conversation Node 中遗漏 `interrupted`，Mobile Companion 就无法显示既有停止标记。[Issue #628](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/628) 记录了观察到的故障。

## Decision

Desktop 的 Host 历史 JSON 解析器只接受缺省或字面量 `true` 的 `assistant/message.data.interrupted`。分页历史与实时 Session 替换中的 assistant 节点都原样转发字面量 `true`；缺省仍保持缺省。[取消前缀决策](../architecture/2026-08-10-cancelled-stream-prefix-finalize.zh.md) 拥有持久中断语义，[实时投影决策](../architecture/2026-08-24-companion-live-session-projection.zh.md) 拥有权威替换语义，[共享呈现决策](../architecture/2026-08-22-shared-mobile-web-presentation.zh.md) 拥有渲染职责。

## Alternatives considered

**从轮次完成状态推导中断。** 不采用，因为 Session 消息已经拥有这个事实；轮次级推导可能给另一条 assistant 响应加上标记，也会在消费方重复取消语义。

**新增 Mobile 专用停止组件。** 不采用，因为共享渲染器已经处理该标记。故障位于 Desktop 生产方，发生在 Mobile 验证或渲染节点之前。

## Consequences

分页历史与实时替换保留相同的持久中断标记。非法 Host 值在 JSON 边界失败，而不是被静默丢弃。既有 Companion 节点字段与共享 `AssistantMarkdown` 呈现无需改变协议版本、缓存迁移、依赖或取消持久性。

## Verification

Desktop 生产方测试覆盖字面量 true 保留、非法值拒绝，以及轮次中止时缺省仍保持缺省。组装测试让真实 Session 消息经过 Host 和 Snow 进入 `MobileCompanionSurface`，包括无需历史请求的实时前缀到中断节点替换。构建后的 Mobile 产品入口快照在手机宽度通过共享渲染器断言 `Stopped` 与 `已停止`。原生验收要求在隔离 Desktop 的本轮自有 Session 中完成一次有界真实模型取消，然后由 Android 和 iOS 打开同一 Session，并验证离开后重新打开仍显示标记。验收不复制任何普通用户 Session，并保留其生成的 Session 直至用户评审完成。这些检查不替代绑定候选版本的发布证据。
