# `@deepseek-ai/dsh-client-ui-workspace-reference`

[English](README.md) | 中文

Web 上名为 `workspace` 的 `@` source。候选来自 Host 工作区引用索引 Remote，并在浏览器内排序。选中后插入纯文本 `@rel/path`（目录保留尾斜杠）。Host 的 pre-step 注入仅表示存在性的标记。决策记录：[工作区引用 Agent Note](../../../.agents/notes/proposed/feature/2026-08-19-workspace-reference.md)。

## Model Experience

无。触发流水线只是浏览器呈现。模型可见标记由 `@deepseek-ai/dsh-workspace-reference` 拥有。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **每个会话一次索引 RPC** — 按键排序在本地完成；在下一次会话作用域或显式失效之前，不监视工作区变更。
- **dock、粘贴忽略、文件夹进入和设置过滤** 属于对齐票，不属于本包第一期。
