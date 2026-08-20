# `@deepseek-ai/dsh-client-ui-workspace-reference`

[English](README.md) | 中文

Web 上名为 `workspace` 的 `@` source。候选来自 Host 工作区引用索引 Remote，并在浏览器内排序。选中后插入以文件名为标签的 chip。提交和剪贴板会展开为 `@rel/path`（目录保留尾斜杠）。在目录上按 ArrowRight 会把 token 换成 `@path/` 并保持菜单打开。开启粘贴忽略时，粘贴的 `@` 会带上 word joiner。设置提供启用、粘贴忽略和 Exact/Regex 文件名过滤。Host 的 pre-step 注入仅表示存在性的标记。picker 排序含有源自 [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 0.6.3（MIT）的部分；见 [NOTICE](NOTICE)。决策记录：[工作区引用 Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md)。

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
- **粘贴忽略在 `@` 后插入 U+2060**。手打且存在的路径仍会变成标记。复制和发送的用户文本会保留该标记，以便 Host 扫描在提交和回放时仍跳过该 token。发送前不从模型可见用户文本剥离该标记：它必须留在持久化用户消息里，否则回放会重新扫描 `@path` 并注入工作区引用；只在发送路径剥离则会使模型可见文本与会话日志不一致。
- **刷新后草稿恢复为剪贴板形式** `@rel/path`。文件名 chip 只在插入时存在。
