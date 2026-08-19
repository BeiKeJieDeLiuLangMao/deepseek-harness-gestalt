# `@deepseek-ai/dsh-client-ui-workspace-reference`

[English](README.md) | 中文

Web 上名为 `workspace` 的 `@` source。候选来自 Host 工作区引用索引 Remote，并在浏览器内排序。选中后插入纯文本 `@rel/path`（目录保留尾斜杠）。在目录上按 ArrowRight 会把 token 换成 `@path/` 并保持菜单打开。开启粘贴忽略时，粘贴的 `@` 会带上 word joiner。composer dock 列出已引用路径。设置提供启用、粘贴忽略和 Exact/Regex 文件名过滤。Host 的 pre-step 注入仅表示存在性的标记。picker 排序含有源自 [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 0.6.3（MIT）的部分；见 [NOTICE](NOTICE)。决策记录：[工作区引用 Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md)。

## Configuration

| 键 | 默认值 | 约定 |
|---|---:|---|
| `menuLimit` | `12` | `@` 之后展示的排序 picker 行数上限。 |

## Model Experience

None, as this package is browser presentation only.

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **每个会话一次索引 RPC** — 按键排序在本地完成；在下一次会话作用域或显式失效之前，不监视工作区变更。
- **粘贴忽略在 `@` 后插入 U+2060**；手打且存在的路径仍会变成标记。
