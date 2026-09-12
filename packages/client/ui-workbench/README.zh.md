---
description: "将 Browser Workspace 页面绑定到官方 Sidebar occurrence 的适配层。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

将 Browser Workspace 页面绑定到官方 Sidebar 的 Browser occurrence。Host 等待保留的设置命名空间、启用浏览器标签和链接拦截，并在激活前 dispose 时彻底取消。Client 复用匹配 Profile 的实例，让等待中的 Browser occurrence 先认领其创建页面，再恢复其他页面，并记录带初始 URL 的页面创建失败以便重试。

## 目录

- [包约定](#package-contract)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

本仓适配层与保留的 [`better-sidebar` Host provider](../ui-better-sidebar/README.zh.md)配合。Host apply 会观察 Loader 与 Cordis 生命周期转换，直到命名空间 `dsh-better-sidebar` 完成注册，再通过 `settings.get` / `settings.update` 写入 `tabsEnabled.browser: true` 并打开链接接管（`browserInterceptLinks` / `browserInterceptHttps`）；dispose 会取消未完成的等待且不会产生延迟写入。Client 注册优先级更高的官方 `browser` definition 与 keyed 正文，其中的图标、标题、顺序和引导描述由引导页与 `+` 菜单共同使用；随后发布 `workbenchBrowser`，并依赖 ui-browser 发布的 `browserUi` 服务。`+ → 浏览器` 再建页面时，由 Browser Workspace 决定是否复用 Profile 匹配的实例。带 seed URL 打开的 occurrence 会在建页后立即导航；创建被拒绝会保留在官方 payload 中，chrome 因此提供重试。自动恢复只处理已物化 Sidebar Session；未绑定 occurrence 的 create 结束前，它会先认领新投影页面，结束后再调和其他未认领页面。Runtime 重启使投影 target 失效时，适配层保留 occurrence 与 Profile 身份，由 Browser Workspace 替换缺失页面。真正关闭 occurrence 会关闭 Runtime 页面；revision 过期时先 observe 再重试，临时失败时保留关闭意图。每个 Session 的位置与可见性由官方 Sidebar 持有。Desktop overlay 文档发布该 face，但不调和官方页面。

Browser UI provider 卸载时，工作台停止新的 bridge 操作并等待已接受的 Remote 操作完成。晚到的回复不能更新侧栏标签或启动排队的调和。渲染使用工作台激活时捕获的 provider 回调。

web-app 组合先插入 Better Host 行，再插入本适配层，并保留 `id: ui-browser`。占用关系由 [工作台官方浏览器 Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.zh.md) 规定。

<a id="model-experience"></a>
## 模型体验

通过 Browser Workspace 的创建、navigation 和 close 操作间接影响模型；其状态随后由 `dsh-tool-browser` 渲染。

#### KV Cache 影响

该 adapter 不增加稳定请求前缀；后续 browser 工具结果会反映人工 workbench 操作。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- **保留的文件、Git 与 PTY transport 仍走 `/sidebar`** — 迁移其 UI owner 不会重写可用的 Host transport。
- **客户端 `apply` 用 Cordis 标注根上下文，用 `@deepseek-ai/dsh-session/types` 标注 Session 身份。** 在线 Session 列表来自 Session Controller 的 `sessions` 服务，而不是 `@deepseek-ai/dsh-client-runtime`。

本包不发布运行时不变式配套插件，因为 Sessions、Browser Workspace 与官方 Sidebar 已公开此 adapter 所协调的关系。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
