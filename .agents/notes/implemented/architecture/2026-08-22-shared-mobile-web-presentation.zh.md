# Agent Note: Share Web presentation with Mobile Companion

Status: implemented

[English](2026-08-22-shared-mobile-web-presentation.md) | 中文

## Problem

Mobile Companion 曾用私有 `MobileContentBlock` union 分别实现 Markdown、code、image、Tool、diff、Approval、Ask User、terminal 与 composer markup。共享颜色可以让这棵树看起来像 Desktop Session Surface，但行为、无障碍、失败处理、未知内容与之后的 render-intent 变化仍有两套 implementation。prototype projection 还接受 Desktop 权威 Client Runtime projection 从未产生的标签与文本行。

## Decision

Web presentation owner 提供显式 `./presentation` 入口。`ui-conversation` 拥有 assistant Markdown、user bubble、terminal failure、Approval 与窄版 `InputBarPresentation` interface；`ui-tool` 拥有递归 Tool presentation、内置 keyed roster 与未知 Tool fallback；`ui-user-questions` 拥有 Ask User；`ui-attachment` 拥有消息图片。`ui-theme` 提供稳定的 stylesheet subpath。这些入口是公共产品 interface，plugin 专用 skeleton path 与 CSS Module 仍为私有。

动态 Client 插件包使用 `browserSubpath` 构建这些浏览器 ESM 入口。该构建面把裸依赖与输出的 CSS 留给导入它的产品 shell，但不会把该包归类为 Desktop 静态链接包；它的主 `dsh.client` 模块表入口保持不变。

Mobile 详情 composition 接受 Client Runtime 的 `ConversationSnapshot`、`ConversationNode`、`ToolCallBlock` 与 `PendingWait` 值。`main.tsx` 使用的 `mountMobileEntry` 接受生产 `MobileCompanionPresentation` interface：经 Desktop 确认的 Session 行、必需的 Session 寻址图片 loader、当前 mutation authority，以及可选 create/submit/cancel/load 回调。Mobile 只增加手机导航以及由环境决定的 locale/theme 选择。它不会定义 transcript content union、从 Relay lifecycle state 推断 interaction authority，也不会挂载 Desktop columns、Settings、model selection、plugin configuration 或 terminal input。

完整 Desktop `InputBar` 与 `ConversationComposer` 使用同一套由 owner 定义的 editor 与 primary-action presentation implementation。`ConversationComposer` 拥有本地 `InputMachine` 草稿，并把获准的 prompt 与 cancellation operation 委托给调用方；它不提供 annotation、attachment、slot、projection、command 或 Host stand-in。加密 Companion Session transport 仍负责向打包 Mobile 入口提供权威 snapshot 与回调。

Desktop keyed slot 与 `ToolPresentation` 使用同一份内置 Tool roster。Bash、read、write/edit、grep/glob、Web、todo 与 question 调用挂载各自专用 owner row；`GenericToolCard` 只渲染未被认领的 wire 名称。直接 composition 把权威 `ToolCallBlock`、cwd 与 home 值送入 `DirectToolCallTree`，不会构造 Chat Node 或 Host description。

## Verification

Mobile component test 把真实 `ConversationSnapshot` 与 `PendingWait` 值送入公共入口，覆盖 Markdown、高亮 code、image、专用普通与未知 Tool、diff、有界 terminal presentation、Approval、Ask User、Host failure copy、locale、theme、窄屏 composition、overflow，以及不出现 Desktop privileged control。keyless browser snapshot 构建打包后的 `main.tsx` 入口，通过拦截的 HTTPS 响应完成 Account lifecycle，再以 390 px 的英文／dark 与中文／light 环境经 `MobileCompanionPresentation` 打开权威 development projection。它不运行 model round，也不证明加密 Desktop transport。两类测试都不使用 `prototype-companion` 或 5173/5174 端口。

## Alternatives considered

**只共享 CSS 与 domain label。**不采用，因为两棵 rendering tree 会继续在语义、键盘行为、未知内容与结构化 Tool output 上产生偏差。

**在手机宽度挂载完整 Desktop slot tree。**不采用，因为 Desktop navigation、details columns、Settings、model selection、plugin configuration 与 terminal affordance 超出 Companion Surface authority，且会形成不可用的窄屏布局。

**在 Runtime 与 React 之间新增通用 Mobile transcript model。**不采用，因为它会复制权威 Client projection，并要求每次 Conversation Node 或 render intent 变化时再做一层转换。

## Consequences

一处 presentation 修复现在可以同时触达 Desktop 与 Mobile component，Mobile test 也会执行 Desktop 使用的同一 implementation file。公共 presentation 入口扩大了受支持的 package interface，因此需要 package 文档、build/export check，以及经过审慎决定的 compatibility change。Mobile bundle 还会包含共享 Markdown 与 syntax-highlighting asset，增大初始 artifact。该决策没有完成加密 Session transport；在该 transport 提供权威 projection 与 mutation adapter 前，打包后的账号／配对入口不能宣称已连接真实 Paired Desktop conversation。
