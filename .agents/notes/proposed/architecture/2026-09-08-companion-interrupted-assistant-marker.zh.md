# Agent Note: Companion 保留持久 assistant 中断标记

Status: proposed

[English](2026-09-08-companion-interrupted-assistant-marker.md) | 中文

## Problem

取消 assistant 响应后，Session 会保留已经输出的前缀；但 Desktop 如果在 assistant Conversation Node 中遗漏 `interrupted`，Mobile Companion 就无法显示既有停止标记。[Issue #628](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/628) 记录了 [#608](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/608) 中观察到的故障。

## Proposal

Desktop 的 Host 历史 JSON 解析器只接受缺省或字面量 `true` 的 `assistant/message.data.interrupted`。分页历史与实时 Session 替换中的 assistant 节点都原样转发字面量 `true`；缺省仍保持缺省。[取消前缀决策](../../implemented/architecture/2026-08-10-cancelled-stream-prefix-finalize.zh.md) 拥有持久中断语义，[实时投影决策](../../implemented/architecture/2026-08-24-companion-live-session-projection.zh.md) 拥有权威替换语义，[共享呈现决策](../../implemented/architecture/2026-08-22-shared-mobile-web-presentation.zh.md) 拥有渲染职责。这些决策继续有效，不被本提案取代。

## 已接受的视觉基准

基准是源码版本 `6dd74fadaa297d1045db6877a0e156574399bee5` 中既有的 `AssistantMarkdown` 停止标签和共享 Mobile 呈现：[渲染组件](../../../../packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx)、[适配器](../../../../packages/client/ui-conversation/src/presentation.tsx) 与 [Mobile 验证器](../../../../apps/mobile/src/companion-projection.ts)。本范围恢复该已接受组件及其本地化 `Stopped` / `已停止` 文案，不引入新布局或 UX 原型。

## 体验路线

1. 从当前已配对的 Android 和 iOS 安装及各自保留的已取消 Session 开始，使用相同隔离状态让两者重新连接修复后的独立 Desktop。Root 在并行 iOS 测试完成后协调实例交接。
2. 在每个平台上打开其保留的 Session，无需再次调用模型即可刷新权威历史。保留的 assistant 前缀在消息内容下方显示既有停止标记。
3. 至少在一个平台的本轮拥有的 Session 中，使用已授权的隔离配置请求有界真实模型流式输出。出现可见文本后取消。前缀保留，停止标记出现，输入框可接受下一条提示。
4. 离开后重新打开 Session。权威刷新保留相同前缀和标记。核对既有组件的文案与位置，并从已评审的修复版本录制要求的真实流程 GIF。

## Alternatives considered

**从轮次完成状态推导中断。** 不采用，因为 Session 消息已经拥有这个事实；轮次级推导可能给另一条 assistant 响应加上标记，也会在消费方重复取消语义。

**新增 Mobile 专用停止组件。** 不采用，因为共享渲染器已经处理该标记。故障位于 Desktop 生产方，发生在 Mobile 验证或渲染节点之前。

## Acceptance criteria

生产方测试证明分页和实时历史均保留字面量 true 并拒绝非法值。组装回归让真实 Session 的中断 assistant 事件经过 Host、Snow 和 `MobileCompanionSurface`。构建后的 Mobile 产品入口快照在手机宽度断言两种语言的标签。实现同步更新 Desktop 和 Mobile README 的约定。相关测试、文档门禁、评审、原生路线证据、GIF、CI、用户验收和 retro 都须先于 master 合并。

## Risks

非法 Host 值在 JSON 边界失败，而不是被静默丢弃。不计划改变依赖、协议版本、缓存格式、取消持久性或发布门禁。原生复验期间保留应用安装、Personal Pairing 和缓存内容。本范围不授权生产变更、签名、制品发布或版本发布；发布证据必须绑定新的精确候选版本。
