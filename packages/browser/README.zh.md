---
description: "Browser Runtime 包组：与 Provider 无关的浏览器控制、确定性和 Desktop Provider、Session 所有权与模型工具。"
kind: "package-group"
---

# browser/ — 浏览器运行时能力族

[English](README.md) | 中文

## 概述

`browser/` 组定义与 Provider 无关的浏览器控制接口、确定性无密钥 Provider、进程内 Electron Provider、Tandem 形态 HTTP 协议客户端、Session 持有的 Workspace binder，以及延迟加载的模型工具。Desktop Host 在 macOS 与 Windows 上交付 Electron Provider。Linux 不在支持范围内。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

六个包分别负责 Browser Runtime Service Definition、Provider、Session 绑定和模型 Consumer。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.zh.md) | Service Definition 与不透明身份词汇 | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.zh.md) | 确定性的临时、命名持久与共享 Profile Provider | 提供 `ctx.browserRuntime` |
| [`browser-runtime-electron/`](browser-runtime-electron/README.zh.md) | 用于临时、命名持久与共享 Profile 的进程内 Electron Provider | 提供 `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.zh.md) | 用于临时、命名持久与共享 Profile 的 Tandem 形态 HTTP 协议客户端 | 提供 `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.zh.md) | Session 持有的 Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.zh.md) | 面向模型的延迟 Consumer | 注册到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相关文档

- [Browser Runtime 子系统](../../docs/subsystems/browser-runtime.zh.md)——共享类型、生命周期、Provider 与工具。
- [临时 Browser Runtime](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.zh.md)——临时 Profile 生命周期与发现。
- [Electron Browser Runtime](../../.agents/notes/implemented/feature/2026-08-19-electron-browser-runtime.zh.md)——Desktop Host 引擎。
- [Tandem Provider](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.zh.md)——HTTP 协议客户端。
- [持久 Browser Profile](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.zh.md)——命名 partition 隔离与单写入方规则。
- [默认共享 Browser Profile](../../.agents/notes/implemented/feature/2026-08-20-shared-default-browser-profile.zh.md)——省略 profile 时的默认值。
- [Session Browser Workspace](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.zh.md)——Session 本地所有权。
- [浏览器控制权仲裁](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.zh.md)——同一标签页上的人工与 Agent 所有权。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
