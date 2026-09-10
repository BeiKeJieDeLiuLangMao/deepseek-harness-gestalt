# Agent Note: IM account, workspace, and Sidebar GUI

Status: implemented

[English](2026-09-10-im-account-workspace-sidebar-gui.md) | 中文

## Problem

账号接管需要已认可的 GUI：设置 → IM 账号、工作区设置中的接管与模拟卡片，以及 Better Sidebar 对话视图。工作区设置弹窗原先没有扩展槽，接管与模拟无法在不另开窗口的情况下落在代码仓库和协作卡片旁边。GUI 不得另做运行看板，也不得展示密钥。

## Decision

`@deepseek-ai/dsh-client-ui-im` 注册设置分区 `im-accounts`、工作区卡片 `im-takeover` 与 `im-simulation`，以及官方 Sidebar 标签 `@deepseek-ai/dsh-client-ui-im/conversation`。`ui-workspace` 把 `workspace.settings.section` 声明为 `sidebar.workspaces` 的 list 子槽，设置弹窗在成员管理之后渲染这些卡片。新接管规则默认停用。停用指定规则会保留绑定，不回退到「全部」。工作区选中已配置目标之前，模拟工具保持不可用。发送者徽标覆盖 `external` / `ai_outbound` / `human_native` / `human_dsh` / `unknown`。`result_unknown` 不显示为已发送。自动处理关闭时仍可手动发送。审批仍只走原生审批界面。

## Alternatives considered

**独立的 IM 运行看板。** 否决，因为规格把原生审批作为唯一审批表面，并禁止并行运维页。

**把接管与模拟硬编码进 `WorkspaceSettings.tsx`。** 否决，因为其他功能会被迫分叉弹窗；list 槽让成员管理主体保持封闭。

**在本票据内为每次账号与投递变更接 Host remotes。** 否决，因为 T7 拥有已认可表面和对原型状态的 focused 客户端测试；真实读账号与出站投递留给后续授权。

## Consequences

三块表面共用一份从已认可原型播种的内存 GUI 快照。不提供飞书。密钥只生成凭据引用，不进入快照。focused 客户端测试覆盖路由编辑、模拟目标选择、发送者徽标、投递状态、手动发送、双边会话导航，以及无头体验路径。
