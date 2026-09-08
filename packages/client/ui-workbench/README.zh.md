---
description: "挂载 better-sidebar 快照并将官方 Browser 页面绑定到其 browser 标签的 adapter。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

与 [`better-sidebar` 快照](../ui-better-sidebar/README.zh.md)平级的本仓适配层。宿主 apply 在命名空间 `dsh-better-sidebar` 尚未注册时加入快照 loader fiber，然后对该字面命名空间调用 `settings.get` / `settings.update`，写入 `tabsEnabled.browser: true` 并打开链接接管（`browserInterceptLinks` / `browserInterceptHttps`），使 GUI 链接点击与 `sidebar_open` 的 URL 都打开官方页面。客户端 half 发布 `workbenchBrowser`，依赖 ui-browser 发布的必需服务 `browserUi`，并把每个官方 Workspace 页面绑到一个快照 `browser` 标签。`+ → 浏览器` 再建页面时，由 Browser Workspace 决定是否复用 Profile 匹配的实例。带 seed URL 打开的标签会在建页后立即导航到该地址；创建被拒绝会记录在标签 meta 上，chrome 因此提供重试，而不是一直停在创建占位。Runtime 重启使投影 target 失效时，适配层保留原侧栏标签及其 Profile 身份，由 Browser Workspace 替换缺失页面。关掉侧栏标签会关闭 Runtime 页面；revision 过期时先 observe 再重试，临时失败时保留关闭意图，不会重新打开标签。better-sidebar 持有每个 Session 的面板可见状态。Desktop overlay 文档发布该 face，但不调和官方页面。日常产品改动写在这里，不要改快照树。

web-app 组合先插入快照行，再插入本适配层，并保留 `id: ui-browser`。占用关系由 [工作台官方浏览器 Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.zh.md) 规定。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

通过 Browser Workspace 的创建、navigation 和 close 操作间接影响模型；其状态随后由 `dsh-tool-browser` 渲染。

#### KV Cache 影响

该 adapter 不增加稳定请求前缀；后续 browser 工具结果会反映人工 workbench 操作。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- **快照 fs/git/pty 仍走 `/sidebar`** — 本期不把它们迁到官方 `fs` 或 `terminal` 能力缝。
- **客户端 `apply` 用 Cordis 标注根上下文，用 `@deepseek-ai/dsh-session/types` 标注 Session 身份。** 在线 Session 列表来自 Session Controller 的 `sessions` 服务，而不是 `@deepseek-ai/dsh-client-runtime`。

本包不发布运行时不变式配套插件，因为此 adapter 协调的快照由 Sessions 与 Better Sidebar 拥有，adapter 本身不保留独立权威状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
