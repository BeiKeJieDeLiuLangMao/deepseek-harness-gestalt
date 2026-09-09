---
description: "挂载 better-sidebar 快照并将官方 Browser 页面绑定到其 browser 标签的 adapter。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

装载固定版本的 Better Sidebar 快照，并将官方 Browser Workspace 页面绑定到其浏览器标签页。Host 等待快照命名空间、启用浏览器标签和链接拦截，并在激活前 dispose 时彻底取消。Client 复用匹配 Profile 的实例，并记录带初始 URL 的页面创建失败以便重试。

## 目录

- [包约定](#package-contract)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

与 [`better-sidebar` 快照](../ui-better-sidebar/README.zh.md)平级的本仓适配层。宿主 apply 会观察 Loader 与 Cordis 生命周期转换，直到快照 loader fiber 激活且命名空间 `dsh-better-sidebar` 完成注册；注册仍在等待时，它会加入该 fiber。快照行失败会原样传播，无关 Loader 行的失败不会中止等待；就绪后才通过该字面命名空间的 `settings.get` / `settings.update` 写入 `tabsEnabled.browser: true` 并打开链接接管（`browserInterceptLinks` / `browserInterceptHttps`）；dispose 会取消未完成的等待且不会产生延迟写入。客户端 half 发布 `workbenchBrowser`，依赖 ui-browser 发布的必需服务 `browserUi`，并把每个官方 Workspace 页面绑到一个快照 `browser` 标签。`+ → 浏览器` 再建页面时，由 Browser Workspace 决定是否复用 Profile 匹配的实例。带 seed URL 打开的标签会在建页后立即导航到该地址；创建被拒绝会记录在标签 meta 上，chrome 因此提供重试，而不是一直停在创建占位。Runtime 重启使投影 target 失效时，适配层保留原侧栏标签及其 Profile 身份，由 Browser Workspace 替换缺失页面。关掉侧栏标签会关闭 Runtime 页面；revision 过期时先 observe 再重试，临时失败时保留关闭意图，不会重新打开标签。better-sidebar 持有每个 Session 的面板可见状态。Desktop overlay 文档发布该 face，但不调和官方页面。日常产品改动写在这里，不要改快照树。

Browser UI provider 卸载时，工作台停止新的 bridge 操作并等待已接受的 Remote 操作完成。晚到的回复不能更新侧栏标签或启动排队的调和。渲染使用工作台激活时捕获的 provider 回调。

web-app 组合先插入快照行，再插入本适配层，并保留 `id: ui-browser`。占用关系由 [工作台官方浏览器 Agent Note](../../../.agents/notes/implemented/feature/2026-08-21-workbench-official-browser.zh.md) 规定。

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
