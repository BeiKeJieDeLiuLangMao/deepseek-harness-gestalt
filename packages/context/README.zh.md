# context/ — 请求上下文扩展

[English](README.md) | 中文

在不定义工具的情况下添加模型可见的请求上下文的产品插件。`agent-instructions` 包含在默认 `dsh-agent-spine-demo` 组合包中，可通过组合包配置禁用；`time-context`、`tmux-context` 和 `session-reference` 需主动启用。`workspace-reference` 随 web profile 交付。

| 包 | 职责 | ctx key |
|---|---|---|
| [`workspace-reference/`](workspace-reference/README.md) | 仅表示存在性的工作区路径指针 | — |
| [`session-reference/`](session-reference/README.md) | 其他会话的有界快照 | `ctx.sessionReferenceResolver` |
| [`time-context/`](time-context/README.md) | 当前时间与耗时上下文 | — |
| [`tmux-context/`](tmux-context/README.md) | tmux 位置上下文 | — |
| [`agent-instructions/`](agent-instructions/README.md) | 工作区指令上下文 | — |

会话引用见 [docs/subsystems/session-reference.md](../../docs/subsystems/session-reference.md)；工作区引用见 [docs/subsystems/workspace-reference.md](../../docs/subsystems/workspace-reference.md)；[`agent-instructions` 决策记录](../../.agents/notes/implemented/feature/2026-06-24-workspace-context.md)规定了其按 agent（智能体）/会话隔离与生命周期拆分。
