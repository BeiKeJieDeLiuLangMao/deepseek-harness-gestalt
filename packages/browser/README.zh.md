# browser/ — 浏览器运行时能力族

[English](README.md) | 中文

本能力族定义与 Provider 无关的浏览器控制接口、确定性无密钥 Provider、进程内 Electron Provider、Tandem 形态 HTTP 协议客户端、Session 持有的 Workspace binder，以及延迟加载的模型工具。Desktop Host 在 macOS 与 Windows 上交付 Electron Provider。Linux 不在支持范围内。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition 与不透明身份词汇 | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | 确定性的临时与命名持久 Profile Provider | 提供 `ctx.browserRuntime` |
| [`browser-runtime-electron/`](browser-runtime-electron/README.md) | 用于临时与命名持久 Profile 的进程内 Electron Provider | 提供 `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | 用于临时与命名持久 Profile 的 Tandem 形态 HTTP 协议客户端 | 提供 `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.md) | Session 持有的 Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.md) | 面向模型的延迟 Consumer | 注册到 `ctx.tools` |

子系统参考见 [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md)。[临时浏览器运行时 Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md)记录生命周期与发现；[进程内 Electron Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-19-electron-browser-runtime.md)记录 Desktop Host 引擎；[Tandem provider Agent Note](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md)记录 HTTP 协议客户端；[持久 Browser Profile Agent Note](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.md)记录命名 partition 隔离与单写入方规则；[Session Browser Workspace Agent Note](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.md)记录 Session 本地所有权；[浏览器控制权仲裁 Agent Note](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.md)记录同一标签页上的人工与 Agent 控制权。
