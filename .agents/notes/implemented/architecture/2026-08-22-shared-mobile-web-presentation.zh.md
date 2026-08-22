# Agent Note: Share Web presentation with Mobile Companion

Status: implemented

[English](2026-08-22-shared-mobile-web-presentation.md) | 中文

## Problem

Mobile Companion 曾用私有 `MobileContentBlock` union 分别实现 Markdown、code、image、Tool、diff、Approval、Ask User、terminal 与 composer markup。共享颜色可以让这棵树看起来像 Desktop Session Surface，但行为、无障碍、失败处理、未知内容与之后的 render-intent 变化仍有两套 implementation。prototype projection 还接受 Desktop 权威 Client Runtime projection 从未产生的标签与文本行。

## Decision

Web presentation owner 提供显式 `./presentation` 入口。`ui-conversation` 拥有 assistant Markdown、user bubble、terminal failure、Approval 以及 InputBar/InputMachine adapter；`ui-tool` 拥有递归 Tool presentation 与通用 render-intent fallback；`ui-user-questions` 拥有 Ask User；`ui-attachment` 拥有消息图片。`ui-theme` 提供稳定的 stylesheet subpath。这些入口是公共产品 interface，plugin 专用 skeleton path 与 CSS Module 仍为私有。

动态 Client 插件包使用 `browserSubpath` 构建这些浏览器 ESM 入口。该构建面把裸依赖与输出的 CSS 留给导入它的产品 shell，但不会把该包归类为 Desktop 静态链接包；它的主 `dsh.client` 模块表入口保持不变。

Mobile 详情 composition 接受 Client Runtime 的 `ConversationSnapshot`、`ConversationNode`、`ToolCallBlock` 与 `PendingWait` 值。它只增加手机导航、locale/theme 选择、会话授权图片 loader，以及 submit/cancel/load 回调。它不会定义 transcript content union、从 `companion-push` 推断 interaction authority，也不会挂载 Desktop columns、Settings、model selection、plugin configuration 或 terminal input。

`ConversationComposer` 是基于 Desktop 同款 `InputBar` 与 `InputMachine` 的本地草稿 adapter。其 interface 把获准的 prompt 与 cancellation operation 委托给调用方；它不拥有 Session state 或 remote delivery。加密 Companion Session transport 仍负责向打包 Mobile 入口提供权威 snapshot 与回调。

## Verification

Mobile component test 把真实 `ConversationSnapshot` 与 `PendingWait` 值送入公共入口，覆盖 Markdown、高亮 code、image、普通与未知 Tool、diff、有界 terminal presentation、Approval、Ask User、Host failure copy、locale、theme、窄屏 composition、overflow，以及不出现 Desktop privileged control。Mobile Vite build 证明产品入口打包了这些公共 interface。产品视觉证据加载该 bundled entry，而不是 `prototype-companion` 或 5173/5174 端口。

## Alternatives considered

**只共享 CSS 与 domain label。**不采用，因为两棵 rendering tree 会继续在语义、键盘行为、未知内容与结构化 Tool output 上产生偏差。

**在手机宽度挂载完整 Desktop slot tree。**不采用，因为 Desktop navigation、details columns、Settings、model selection、plugin configuration 与 terminal affordance 超出 Companion Surface authority，且会形成不可用的窄屏布局。

**在 Runtime 与 React 之间新增通用 Mobile transcript model。**不采用，因为它会复制权威 Client projection，并要求每次 Conversation Node 或 render intent 变化时再做一层转换。

## Consequences

一处 presentation 修复现在可以同时触达 Desktop 与 Mobile component，Mobile test 也会执行 Desktop 使用的同一 implementation file。公共 presentation 入口扩大了受支持的 package interface，因此需要 package 文档、build/export check，以及经过审慎决定的 compatibility change。Mobile bundle 还会包含共享 Markdown 与 syntax-highlighting asset，增大初始 artifact。该决策没有完成加密 Session transport；在该 transport 提供权威 projection 与 mutation adapter 前，打包后的账号／配对入口不能宣称已连接真实 Paired Desktop conversation。
