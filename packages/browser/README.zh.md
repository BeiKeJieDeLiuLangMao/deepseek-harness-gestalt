# browser/ — 浏览器运行时能力族

[English](README.md) | 中文

本能力族定义与 Provider 无关的浏览器控制接口、确定性无密钥 Provider、托管式 Tandem Browser HTTP Provider、Session 持有的 Workspace binder，以及延迟加载的模型工具。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition 与不透明身份词汇 | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | 确定性的临时与命名持久 Profile Provider | 提供 `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | 用于临时与命名持久 Profile 的托管式 Tandem Browser HTTP Provider | 提供 `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.md) | Session 持有的 Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.md) | 面向模型的延迟 Consumer | 注册到 `ctx.tools` |

子系统参考见 [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md)。[临时浏览器运行时 Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md)记录生命周期与发现；[Tandem provider Agent Note](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md)记录托管子进程设计；[Tandem macOS 与 Windows 验收 Agent Note](../../.agents/notes/implemented/testing/2026-08-19-tandem-macos-windows-qualification.md)记录环境门控的真实浏览器路径；[持久 Browser Profile Agent Note](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.md)记录命名 partition 隔离与单写入方规则；[Session Browser Workspace Agent Note](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.md)记录 Session 本地所有权；[浏览器控制权仲裁 Agent Note](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.md)记录同一标签页上的人工与 Agent 控制权。
