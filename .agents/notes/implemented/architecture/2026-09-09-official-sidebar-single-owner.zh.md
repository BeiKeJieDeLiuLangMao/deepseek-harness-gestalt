# Agent Note: 官方 Sidebar 是唯一工作台 owner

Status: implemented

[English](2026-09-09-official-sidebar-single-owner.md) | 中文

## Problem

Web Client 同时挂载官方 Session 工作台与第二个 Better Sidebar React root。在官方工作台取得相应能力 contract 后，第二个 root 仍保留自己的标签注册表、布局 store、持久化 key、链接与文件处理器，以及全局布局占位。

## Decision

Better Client 入口现在通过官方 Sidebar service 与 keyed Slot 注册文件与 viewer、变更、任务、Side Chat、终端、Browser 回退、设置、produced-file 与系统 path 路由，以及 Host `sidebar_open` 投递流。Browser Workspace 与 Phone 从各自所属包注册优先级更高或独立的官方 definition。入口不再创建 React root、提供 `ctx.betterSidebar`、构造 Better 布局 store 或注册表、导入 Better 布局样式表，也不再安装旧的打开处理器。

Desktop 设置 overlay 会注册 definition、viewer inventory、自定义设置 seat、locale 数据、IME 与设置图标 adapter。它不会订阅 Side Chat、终端、变更与任务自动化、Browser 链接拦截或 Host 打开投递。Browser Workspace 同样会在 overlay 发布 face，但不调和 Runtime 页面。这些规则在保留 overlay 设置 inventory 的同时，只留下一个活动 Session 工作台与一组外部 owner 订阅。

官方 workbench 也拥有 Dock 添加 action。Web 打开引导页；Desktop 把可观察的官方页面 definition 投影到既有原生 overlay 协议，并在来源 pane 中打开用户选中的 kind。DockKit 只把被按下的控件作为可选菜单锚点传入。

Better Host 路由继续保留，因为官方文件、Git、PTY、jobs、Side Chat、Browser 回退与模型打开 consumer 仍使用这些有界 transport。移除重复 Client owner 不会改变这些 provider 的信任、Session、工作空间围栏或拆除规则。现有 Better 布局 key 保持原字节不动，可供回退。

## Alternatives considered

若把 Dock 添加菜单留在主 renderer，Electron Browser `WebContentsView` 会覆盖其菜单行。硬编码一份独立的 Desktop 类型列表则会产生第二份清单。因此，原生 overlay 接收可观察的官方 registry；带 React Slot action 的 renderer 菜单打开时会暂时 conceal 原生页面，菜单关闭后再恢复页面。

## Consequences

官方右侧与底部 surface 现在持有位置、持久化、焦点、关闭准入、definition、viewer 匹配与设置。非活动 Session 的文件、文件夹、URL、Phone、Browser 与 runtime 打开使用 Session-bound 官方导航。插件目录把 `ctx.sidebarRightTabs` 标为扩展 service。

定向 typecheck 与 Better Client bundle 证明新入口可以编译，且产物不包含 Better service、store 或 root constructor。功能测试覆盖各官方 definition、正文、runtime、路由、设置与 Member Question 投影。Commit-identical Web 与 Desktop 产品验收仍是独立门禁。

## Related decisions

本决策实现[官方 Sidebar 能力融合](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.zh.md)提出的 owner 变更。保留能力的细节仍由其中链接的功能 Agent Note 持有。
