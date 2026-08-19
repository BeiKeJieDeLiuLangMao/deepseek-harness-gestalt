# `@deepseek-ai/dsh-workspace-reference`

[English](README.md) | 中文

校验直接用户消息中的 `@path` token，并在 agent 步骤开始前注入仅表示存在性的工作区引用。本插件不读取文件字节，也不列出目录子项。决策记录：[工作区引用 Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md)。

## Public API

- `scanMentions(text)` 返回去重后的 `@path` token。`@[label](dsh-session:…)` 不是路径 token。
- `expandMentions(messages, cwd, fileSystem, signal)` 用 `lstat` 校验 token，并返回带 source 的 `user/message` 注入。
- `indexWorkspace(fileSystem, cwd, options, signal)` 按一层 `listDir` 遍历，跳过忽略基名和末段 symlink，并在目录 `FS_PERMISSION_DENIED` 时省略该子树。
- `rankFiles(files, query, limit)` 为 picker 候选排序：基名查询、有序路径段查询，以及目录优先的浏览。
- `workspaceReference.search` 是 picker Remote：返回被寻址会话的原始索引；浏览器按键排序。

## Configuration

| 键 | 默认值 | 约定 |
|---|---:|---|
| `maxIndexedFiles` | `5000` | picker 索引条目上限；遍历停在该上限并报告截断。 |
| `ignoreDirs` | 内置 VCS、IDE、依赖与构建目录名 | picker 遍历跳过的目录基名。提供该键会替换内置列表。 |

## Model Experience

### Workspace path pointer

#### What the model sees

每个经过校验的路径对应一条带 source 的 user 角色消息：

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

路径是工作区相对路径。`kind` 为 `file` 或 `directory`。任务需要内容时，模型使用会话里已有的工具检查该路径。

#### Token effect

每条引用只增加一条短标记。这里不加入文件字节和目录清单。

#### KV Cache effect

仅追加。新引用只改变新的后缀。

## Known Limitations and Deferred Work

- **第一期只在 Web 挂扫描器** — 其他 host 以后可以挂同一插件；在此之前不扫描 ACP 和 SDK 文本。
- **picker 索引是建议性的** — 超出 `maxIndexedFiles` 或位于被忽略目录内的路径，只要手打的 `@path` 真实存在于工作区内，仍可成为引用。
- **没有 gitignore** — 只应用已配置的目录基名，以及后续的设置过滤。
