# browser/ — 浏览器运行时能力族

[English](README.md) | 中文

本能力族定义与 Provider 无关的浏览器控制接口、用于一个临时 Profile 与一个标签页的确定性无密钥 Provider，以及延迟加载的模型工具。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition 与不透明身份词汇 | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | 确定性的临时 Profile Provider | 提供 `ctx.browserRuntime` |
| [`tool-browser/`](tool-browser/README.md) | 面向模型的延迟 Consumer | 注册到 `ctx.tools` |

子系统参考见 [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md)。[临时浏览器运行时 Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md)记录生命周期、发现与持久化决策。
